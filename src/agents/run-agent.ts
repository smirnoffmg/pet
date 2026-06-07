import path from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { loadConfig } from "@/config.js";
import { createModel, resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { loadMcpTools } from "@/llm/mcp-tools.js";
import type { PdtLogger } from "@/log.js";
import { createLogger } from "@/log.js";
import { loadPrompt, type PromptRole } from "./load-prompt.js";
import { permissionsForRole, type AgentRole } from "./path-permissions.js";
import { estimateUsdFromTokens, extractTokenUsage } from "./usage.js";
import { recordUsage } from "./session-stats.js";
import type { SubagentCommand } from "./types.js";
import type {
  AnalystBrief,
  ArchitectBrief,
  DesignerEnrichBrief,
  FeatureDesignerBrief,
  ResearcherBrief,
  SolutionDesignerBrief,
  TechLeadBrief,
  DevBrief,
  QaBrief,
  DevOpsBrief,
} from "./types.js";

export type AgentBrief =
  | ArchitectBrief
  | TechLeadBrief
  | AnalystBrief
  | ResearcherBrief
  | SolutionDesignerBrief
  | FeatureDesignerBrief
  | DesignerEnrichBrief
  | DevBrief
  | QaBrief
  | DevOpsBrief;

export type ToolCallEvent = { name: string; path: string };

export async function runLiveAgent(
  role: AgentRole,
  docRoot: string,
  brief: AgentBrief,
  logger: PdtLogger = createLogger({ verbose: loadConfig().verbose }),
  commandKind?: SubagentCommand["kind"],
  onToolCall?: (event: ToolCallEvent) => void,
): Promise<unknown> {
  const promptRole = promptRoleFor(commandKind, role);
  logger.info(
    `Live agent ${role} (provider: ${resolveProvider()}, model: ${resolveModelId()}, prompt: ${promptRole})`,
  );
  logger.verbose(`Brief target: ${briefTargetId(role, brief, commandKind)}`);

  const repoRoot = path.dirname(docRoot);
  const { tools: mcpTools, disconnect } = await loadMcpTools(role, repoRoot);

  const backend = new FilesystemBackend({
    rootDir: docRoot,
    virtualMode: true,
  });

  const agent = createDeepAgent({
    model: await createModel(),
    systemPrompt: loadPrompt(promptRole),
    backend,
    tools: mcpTools,
    permissions: permissionsForRole(role),
    name: `pet-${role}`,
  });

  let result: unknown;
  const started = Date.now();
  const userMessage = formatMessage(role, brief, commandKind);
  try {
    if (onToolCall) {
      const run = await agent.streamEvents(
        { messages: [{ role: "user", content: userMessage }] },
        { version: "v3" },
      );
      const toolCallsTask = (async () => {
        for await (const call of run.toolCalls) {
          const raw = (call.input ?? {}) as Record<string, unknown>;
          const path = String(raw["path"] ?? raw["file"] ?? raw["pattern"] ?? "").slice(0, 40);
          onToolCall({ name: call.name, path });
        }
      })();
      const [output] = await Promise.all([run.output, toolCallsTask]);
      result = output;
    } else {
      result = await agent.invoke({
        messages: [{ role: "user", content: userMessage }],
      });
    }
  } finally {
    await disconnect();
  }
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  const messageCount = countMessages(result);
  logger.info(`Live agent ${role} completed in ${elapsedSec}s (${messageCount} messages)`);

  const usage = extractTokenUsage(result);
  if (usage) {
    recordUsage(usage);
    const usd = estimateUsdFromTokens(usage);
    logger.outcome(
      `Claude usage: ${usage.inputTokens} input + ${usage.outputTokens} output tokens (~$${usd.toFixed(3)} at Sonnet list rates)`,
    );
  } else {
    logger.outcome("Claude usage: token metadata not available on this run");
  }

  const summary = extractLastAssistantText(result);
  if (summary) {
    logger.outcome(`Agent summary: ${truncate(summary, 400)}`);
  }

  return result;
}

function promptRoleFor(
  commandKind: SubagentCommand["kind"] | undefined,
  role: AgentRole,
): PromptRole {
  if (commandKind === "spawn_designer_enrich") {
    return "designer_enrich";
  }
  if (commandKind === "spawn_solution_designer") {
    return "solution_designer";
  }
  if (commandKind === "spawn_feature_designer") {
    return "designer";
  }
  if (commandKind === "spawn_dev") {
    return "dev";
  }
  if (commandKind === "spawn_qa") {
    return "qa";
  }
  if (commandKind === "spawn_devops") {
    return "devops";
  }
  return role as PromptRole;
}

function briefTargetId(
  role: AgentRole,
  brief: AgentBrief,
  commandKind?: SubagentCommand["kind"],
): string {
  if (commandKind === "spawn_designer_enrich") {
    return (brief as DesignerEnrichBrief).featureId;
  }
  if (commandKind === "spawn_solution_designer") {
    return (brief as SolutionDesignerBrief).hypothesisId;
  }
  if (commandKind === "spawn_feature_designer") {
    return (brief as FeatureDesignerBrief).solutionHypothesisId;
  }
  switch (role) {
    case "architect":
    case "techlead":
      return (brief as ArchitectBrief).featureId;
    case "analyst":
      return (brief as AnalystBrief).metricId;
    case "researcher":
      return (brief as ResearcherBrief).hypothesisId;
    case "solution_designer":
      return (brief as SolutionDesignerBrief).hypothesisId;
    case "designer":
      return (brief as FeatureDesignerBrief).solutionHypothesisId;
    case "dev":
      return (brief as DevBrief).taskId;
    case "qa":
      return (brief as QaBrief).featureId;
    case "devops":
      return (brief as DevOpsBrief).releaseId;
    case "orchestrator":
      return "orchestrator";
  }
}

function countMessages(result: unknown): string {
  if (typeof result !== "object" || result === null || !("messages" in result)) {
    return "?";
  }
  const messages = (result as { messages: unknown }).messages;
  return Array.isArray(messages) ? String(messages.length) : "?";
}

function extractLastAssistantText(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("messages" in result)) {
    return null;
  }
  const messages = (result as { messages: unknown[] }).messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (typeof m !== "object" || m === null) {
      continue;
    }
    const type = "type" in m ? String((m as { type: unknown }).type) : "";
    if (type !== "ai" && type !== "AIMessage") {
      continue;
    }
    const content = "content" in m ? (m as { content: unknown }).content : null;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

// Ollama small models need explicit guidance on the tool-use workflow — they
// hallucinate paths and skip tool calls without it.
const OLLAMA_TOOL_HINT = `

IMPORTANT — you MUST use tool calls to complete this task. All paths MUST be absolute (start with /):
1. Use ls <absolute-path> or glob to discover actual file paths. NEVER guess or invent paths.
2. Use read_file to read the current content of any file before modifying it.
3. Use write_file to save ALL changes. Do not describe what you would write — execute write_file.
If creating a new file, first ls the target directory to find the next available ID and name.`;

const OLLAMA_DIR_HINTS: Partial<Record<AgentRole, string>> = {
  researcher:
    "The markdown artifact files are in /product/00-problem-hypotheses/. Use ls /product/00-problem-hypotheses/ to list them.",
  solution_designer:
    "Create new markdown files in /product/02-solution-hypotheses/. Use ls /product/02-solution-hypotheses/ to pick the next ID.",
  designer:
    "Create or update markdown files in /product/03-features/. Use ls /product/03-features/ to list existing files.",
  architect:
    "Update feature files in /product/03-features/ and optionally create ADRs in /adr/ using Michael Nygard format (no YAML frontmatter). Use ls on those directories.",
  techlead:
    "Create markdown task files in /product/04-tasks/. Use ls /product/04-tasks/ to pick the next ID.",
  dev: "Update markdown task files in /product/04-tasks/. Use ls /product/04-tasks/ to find the file to update.",
  qa: "Create a markdown QA plan file in /product/05-qa-plans/. Use ls /product/05-qa-plans/ to pick the next ID.",
  devops:
    "Update the markdown release file in /product/06-releases/. Use ls /product/06-releases/ to find it.",
};

function ollamaDirHint(role: AgentRole, commandKind?: SubagentCommand["kind"]): string {
  if (commandKind === "spawn_designer_enrich")
    return "Update the markdown feature file in /product/03-features/. Use ls /product/03-features/ to find it.";
  if (commandKind === "spawn_solution_designer")
    return "Create new markdown files in /product/02-solution-hypotheses/. Use ls /product/02-solution-hypotheses/ to pick the next ID.";
  if (commandKind === "spawn_feature_designer")
    return "Create new markdown feature files in /product/03-features/. Use ls /product/03-features/ to pick the next ID.";
  if (commandKind === "spawn_dev")
    return "Update markdown task files in /product/04-tasks/. Use ls /product/04-tasks/ to find the file.";
  if (commandKind === "spawn_qa")
    return "Create a markdown QA plan file in /product/05-qa-plans/. Use ls /product/05-qa-plans/ to pick the next ID.";
  if (commandKind === "spawn_devops")
    return "Update the markdown release file in /product/06-releases/. Use ls /product/06-releases/ to find it.";
  return OLLAMA_DIR_HINTS[role] ?? "";
}

function formatMessage(
  role: AgentRole,
  brief: AgentBrief,
  commandKind?: SubagentCommand["kind"],
): string {
  const base = buildUserMessage(role, brief, commandKind);
  if (!base || resolveProvider() !== "ollama") return base;
  const dirHint = ollamaDirHint(role, commandKind);
  return base + OLLAMA_TOOL_HINT + (dirHint ? `\n${dirHint}` : "");
}

function buildUserMessage(
  role: AgentRole,
  brief: AgentBrief,
  commandKind?: SubagentCommand["kind"],
): string {
  if (commandKind === "spawn_designer_enrich") {
    const b = brief as DesignerEnrichBrief;
    return `Enrich feature ${b.featureId}: ${b.featureTitle}

Current feature body (scaffold only):

${b.featureBody}

Linked solution hypothesis ${b.solutionHypothesisId}: ${b.solutionHypothesisTitle}

${b.solutionHypothesisBody}

Fill Context, Decision, Acceptance criteria, and Consequences with substantive content. Do not change frontmatter.`;
  }

  if (commandKind === "spawn_solution_designer") {
    const b = brief as SolutionDesignerBrief;
    return `Draft proposed solution hypothesis(es) for accepted problem hypothesis ${b.hypothesisId}: ${b.hypothesisTitle}\n\n${b.hypothesisBody}`;
  }

  if (commandKind === "spawn_feature_designer") {
    const b = brief as FeatureDesignerBrief;
    return `Draft proposed feature(s) for accepted solution hypothesis ${b.solutionHypothesisId}: ${b.solutionHypothesisTitle}\n\n${b.solutionHypothesisBody}`;
  }

  switch (role) {
    case "architect": {
      const b = brief as ArchitectBrief;
      return `Review feature ${b.featureId}: ${b.featureTitle}\n\n${b.featureBody}\n\nEither create an ADR in /adr/ using Michael Nygard format (# N. Title, Date:, ## Status, ## Context, ## Decision, ## Consequences — no YAML frontmatter) or set architectural_review_status to cleared on the feature.`;
    }
    case "techlead": {
      const b = brief as TechLeadBrief;
      return `Decompose feature ${b.featureId}: ${b.featureTitle}\n\n${b.featureBody}\n\nCreate DevTask files under /product/04-tasks/.`;
    }
    case "analyst": {
      const b = brief as AnalystBrief;
      return `Draft proposed hypothesis(es) for metric ${b.metricId}: ${b.metricTitle}\n\n${b.metricBody}`;
    }
    case "researcher": {
      const b = brief as ResearcherBrief;
      const base = `Fill ## Evidence for hypothesis ${b.hypothesisId}: ${b.hypothesisTitle}\n\n${b.hypothesisBody}`;
      return b.context ? `${base}\n\n---\n\n${b.context}` : base;
    }
    case "solution_designer": {
      const b = brief as SolutionDesignerBrief;
      return `Draft proposed solution hypothesis(es) for accepted problem hypothesis ${b.hypothesisId}: ${b.hypothesisTitle}\n\n${b.hypothesisBody}`;
    }
    case "designer": {
      const b = brief as FeatureDesignerBrief;
      return `Draft proposed feature(s) for accepted solution hypothesis ${b.solutionHypothesisId}: ${b.solutionHypothesisTitle}\n\n${b.solutionHypothesisBody}`;
    }
    case "dev": {
      const b = brief as DevBrief;
      return `Enrich task ${b.taskId}: ${b.taskTitle}\n\n${b.taskBody}\n\nLinked feature ${b.featureId}: ${b.featureTitle}\n\n${b.featureBody}\n\nAdd implementation approach, sub-steps, and edge cases to the task body.`;
    }
    case "qa": {
      const b = brief as QaBrief;
      return `Create a QA plan for feature ${b.featureId}: ${b.featureTitle}\n\n${b.featureBody}\n\nCompleted tasks: ${b.taskIds.join(", ")}`;
    }
    case "devops": {
      const b = brief as DevOpsBrief;
      return `Add a deployment checklist and rollback plan to release ${b.releaseId}: ${b.releaseTitle}\n\n${b.releaseBody}\n\nFeatures in this release: ${b.featureIds.join(", ")}`;
    }
    case "orchestrator":
      return "";
  }
}
