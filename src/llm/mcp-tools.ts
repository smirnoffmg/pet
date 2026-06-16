import fs from "node:fs";
import path from "node:path";
import { ok, err, type Result } from "neverthrow";
import { z } from "zod";
import { MultiServerMCPClient, type ClientConfig } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { McpConfigError } from "@/errors/index.js";
import { mcpServersForRole, type AgentRole } from "@/agents/path-permissions.js";

const stdioServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const sseServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("sse"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

// Streamable HTTP is the MCP spec's current remote transport; SSE is kept for
// legacy servers that haven't migrated. Both take a url + optional auth headers.
const httpServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
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

export async function loadMcpTools(
  role: AgentRole,
  repoRoot: string,
): Promise<Result<McpToolsResult, McpConfigError>> {
  const allowedNames = mcpServersForRole(role);
  if (allowedNames.length === 0) {
    return ok(EMPTY);
  }

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

  const allowed = parsed.data.servers.filter((s) => allowedNames.includes(s.name));
  if (allowed.length === 0) {
    return ok(EMPTY);
  }

  const mcpServers: Record<string, unknown> = {};
  for (const s of allowed) {
    if (s.transport === "stdio") {
      mcpServers[s.name] = {
        transport: "stdio" as const,
        command: s.command,
        args: s.args ?? [],
        ...(s.env !== undefined ? { env: s.env } : {}),
      };
    } else {
      mcpServers[s.name] = {
        transport: s.transport,
        url: s.url,
        ...(s.headers !== undefined ? { headers: s.headers } : {}),
      };
    }
  }

  const client = new MultiServerMCPClient({ mcpServers } as ClientConfig);
  const tools = await client.getTools();

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
