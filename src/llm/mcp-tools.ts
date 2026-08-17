import fs from "node:fs";
import path from "node:path";
import { ok, err, type Result } from "neverthrow";
import { z } from "zod";
import { MultiServerMCPClient, type ClientConfig } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { McpConfigError } from "@/errors/index.js";
import { AGENT_ROLES, mcpServersForRole, type AgentRole } from "@/agents/path-permissions.js";
import { createLogger, type PetLogger } from "@/log.js";

// Which agents may reach a server, and which of its tools they get, is policy —
// it lives here in pet.mcp.json, not in pet's source. `roles` falls back to the
// built-in wiring when omitted; `tools` is an allow-list of name patterns
// (trailing `*` allowed) and defaults to every tool the server advertises.
// `timeoutMs` raises the MCP request timeout for servers whose tools are slow —
// a Jira search across an epic takes far longer than the 60s default allows.
const policyFields = {
  roles: z.array(z.enum(AGENT_ROLES)).optional(),
  tools: z.array(z.string().min(1)).optional(),
  timeoutMs: z.number().int().positive().optional(),
};

const stdioServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  ...policyFields,
});

const sseServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("sse"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  ...policyFields,
});

// Streamable HTTP is the MCP spec's current remote transport; SSE is kept for
// legacy servers that haven't migrated. Both take a url + optional auth headers.
const httpServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  ...policyFields,
});

export const mcpServerSchema = z.discriminatedUnion("transport", [
  stdioServerSchema,
  sseServerSchema,
  httpServerSchema,
]);

export const mcpConfigSchema = z.object({
  servers: z.array(mcpServerSchema),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;

export type McpToolsResult = {
  tools: StructuredToolInterface[];
  disconnect: () => Promise<void>;
};

const EMPTY: McpToolsResult = {
  tools: [],
  disconnect: async () => {},
};

const ENV_PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

// Secrets belong in the environment, not in a committed pet.mcp.json, so header
// and env values may reference them as ${VAR}.
function expandEnv(record: Record<string, string>, missing: Set<string>): Record<string, string> {
  const expanded: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    expanded[key] = value.replace(ENV_PLACEHOLDER, (placeholder, name: string) => {
      const resolved = process.env[name];
      if (resolved === undefined) {
        missing.add(name);
        return placeholder;
      }
      return resolved;
    });
  }
  return expanded;
}

// A rate-limited server is temporarily unavailable, not broken: the Confluence
// MCP server revalidates its token on every call and answers 429 when an agent
// researches in bursts. Dropping the server would cost the agent that source
// entirely, so back off and try again instead.
//
// Matching on the message rather than a status code is forced, not lazy. The 429
// happens on a hop we never see — Confluence answering the MCP server behind the
// gateway — and comes back to us as a *successful* HTTP 200 whose JSON-RPC body
// carries isError with the status as prose. @langchain/mcp-adapters then reduces
// that body to a ToolException built from its text blocks alone (tools.js:314),
// so by the time an error reaches this wrapper the status exists only as a
// string. The one structured signal left, `name === "ToolException"`, says the
// tool failed but not why.
// The same server also goes slow before it goes 429, and a connect-time timeout
// is as transient as a rate limit — both deserve a second try rather than a dead
// run.
const TRANSIENT = /\b429\b|too many requests|rate limit|timed out|timeout|ECONNRESET/i;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

async function retryTransient<T>(
  operation: () => Promise<T>,
  label: string,
  logger: PetLogger,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (attempt >= RETRY_DELAYS_MS.length || !TRANSIENT.test(message)) {
        throw e;
      }
      const delay = RETRY_DELAYS_MS[attempt] ?? 0;
      logger.info(`${label} failed transiently, retrying in ${delay}ms: ${message.slice(0, 120)}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Once the retries are spent, hand the failure to the agent as a tool result.
// A remote server that stays slow is information the agent can act on — it still
// has the other sources — whereas letting the rejection escape ends the whole
// run, which is how a single flaky Jira search used to cost an entire session.
function withRetry<T extends StructuredToolInterface>(tool: T, logger: PetLogger): T {
  const call = tool.invoke.bind(tool);
  tool.invoke = async (
    input: Parameters<typeof call>[0],
    config?: Parameters<typeof call>[1],
  ): Promise<unknown> => {
    try {
      return await retryTransient(() => call(input, config), tool.name, logger);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.info(`${tool.name} failed, reporting it to the agent: ${message.slice(0, 200)}`);
      return `Tool ${tool.name} failed: ${message}\nDo not retry it; continue with the sources you can still reach.`;
    }
  };
  return tool;
}

// Tools arrive namespaced as `<server>-<tool>`; patterns are matched against the
// tool name as the server advertises it, with `*` standing for any run of chars.
function toolMatcher(patterns: string[]): (toolName: string) => boolean {
  const regexes = patterns.map(
    (p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`),
  );
  return (toolName) => regexes.some((r) => r.test(toolName));
}

export async function loadMcpTools(
  role: AgentRole,
  repoRoot: string,
  logger: PetLogger = createLogger({ verbose: false }),
): Promise<Result<McpToolsResult, McpConfigError>> {
  const configPath = path.join(repoRoot, "pet.mcp.json");
  if (!fs.existsSync(configPath)) {
    return ok(EMPTY);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return err(new McpConfigError(`Failed to parse pet.mcp.json: invalid JSON`));
  }

  const parsed = mcpConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new McpConfigError(`pet.mcp.json is invalid: ${parsed.error.message}`));
  }

  const fallbackNames = mcpServersForRole(role);
  const allowed = parsed.data.servers.filter((s) =>
    s.roles === undefined ? fallbackNames.includes(s.name) : s.roles.includes(role),
  );
  if (allowed.length === 0) {
    return ok(EMPTY);
  }

  const mcpServers: Record<string, unknown> = {};
  const missingEnv = new Set<string>();
  for (const s of allowed) {
    const timeout = s.timeoutMs !== undefined ? { defaultToolTimeout: s.timeoutMs } : {};
    if (s.transport === "stdio") {
      mcpServers[s.name] = {
        transport: "stdio" as const,
        command: s.command,
        args: s.args ?? [],
        ...(s.env !== undefined ? { env: expandEnv(s.env, missingEnv) } : {}),
        ...timeout,
      };
    } else {
      mcpServers[s.name] = {
        transport: s.transport,
        url: s.url,
        ...(s.headers !== undefined ? { headers: expandEnv(s.headers, missingEnv) } : {}),
        ...timeout,
      };
    }
  }

  if (missingEnv.size > 0) {
    return err(
      new McpConfigError(
        `pet.mcp.json references unset environment variables: ${[...missingEnv].join(", ")}`,
      ),
    );
  }

  const client = new MultiServerMCPClient({ mcpServers } as ClientConfig);
  const matchers = allowed
    .filter((s) => s.tools !== undefined)
    .map((s) => ({ prefix: `${s.name}-`, matches: toolMatcher(s.tools ?? []) }));
  const advertised = await retryTransient(() => client.getTools(), "MCP connect", logger);
  const tools = advertised
    .filter((t) => {
      const policy = matchers.find((m) => t.name.startsWith(m.prefix));
      return policy === undefined || policy.matches(t.name.slice(policy.prefix.length));
    })
    .map((t) => withRetry(t, logger));

  return ok({
    tools,
    disconnect: () => client.close(),
  });
}

export function validateMcpConfig(repoRoot: string): string[] {
  const configPath = path.join(repoRoot, "pet.mcp.json");
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const errors: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return ["pet.mcp.json: invalid JSON"];
  }

  const parsed = mcpConfigSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`pet.mcp.json: ${issue.path.join(".")}: ${issue.message}`);
    }
    return errors;
  }

  const names = parsed.data.servers.map((s) => s.name);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      errors.push(`pet.mcp.json: duplicate server name "${name}"`);
    }
    seen.add(name);
  }

  return errors;
}
