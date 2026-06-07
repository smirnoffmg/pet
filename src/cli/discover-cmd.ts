import { reconcileDiscovery, explainDiscoveryIdle } from "@/controllers/discovery-lead.js";
import type { DiscoveryTarget } from "@/controllers/discovery-lead.js";
import { loadSnapshot } from "@/controllers/snapshot.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import type { ExecuteCallbacks } from "@/agents/executor.js";
import { renderAgentPanel } from "@/cli/render-agent-panel.js";
import { estimatePlanCostUsd, confirmCostIfNeeded } from "@/agents/cost.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { loadConfig, sessionDir } from "@/config.js";
import { resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { scanArtifacts, buildIndex } from "@/store/scan.js";
import { retrieve } from "@/retrieval/index.js";
import type { SubagentCommand } from "@/agents/types.js";
import type { ArtifactId } from "@/schemas/ids.js";
import { createLogger, ensureSessionLogPath, isVerboseEnv } from "@/log.js";
import fs from "node:fs";

export type DiscoverOptions = {
  hypothesis?: string;
  solutionHypothesis?: string;
  feature?: string;
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  noInk?: boolean;
  callbacks?: ExecuteCallbacks;
};

function buildTarget(options: DiscoverOptions): DiscoveryTarget | { error: string } {
  const set = [options.hypothesis, options.solutionHypothesis, options.feature].filter(Boolean);
  if (set.length === 0) {
    return {
      error: "Provide --hypothesis, --solution-hypothesis, or --feature",
    };
  }
  if (set.length > 1) {
    return {
      error: "Provide only one of --hypothesis, --solution-hypothesis, or --feature",
    };
  }
  if (options.hypothesis) {
    return { type: "hypothesis", hypothesisId: options.hypothesis };
  }
  if (options.solutionHypothesis) {
    return { type: "solution_hypothesis", solutionHypothesisId: options.solutionHypothesis };
  }
  return { type: "feature", featureId: options.feature! };
}

function targetLabel(target: DiscoveryTarget): string {
  switch (target.type) {
    case "hypothesis":
      return target.hypothesisId;
    case "solution_hypothesis":
      return target.solutionHypothesisId;
    case "feature":
      return target.featureId;
  }
}

const RESEARCHER_CONTEXT_LIMIT = 5;
const RESEARCHER_CONTEXT_BODY_CHARS = 500;

function enrichResearcherCommands(docRoot: string, commands: SubagentCommand[]): SubagentCommand[] {
  const hasResearcher = commands.some((c) => c.kind === "spawn_researcher");
  if (!hasResearcher) return commands;

  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) return commands;
  const index = buildIndex(scan.value);

  return commands.map((cmd) => {
    if (cmd.kind !== "spawn_researcher") return cmd;

    const seedIds = [cmd.brief.hypothesisId as ArtifactId];
    const result = retrieve(index, {
      seedIds,
      kinds: ["hypothesis", "metric"],
      maxHops: 2,
      limit: RESEARCHER_CONTEXT_LIMIT + 1,
      excludeSuperseded: true,
    });
    if (result.isErr()) return cmd;

    const contextItems = result.value.items
      .filter((item) => item.artifact.frontmatter.id !== cmd.brief.hypothesisId)
      .slice(0, RESEARCHER_CONTEXT_LIMIT);
    if (contextItems.length === 0) return cmd;

    const contextBlock = [
      "## Related artifacts (graph context)",
      ...contextItems.map((item) => {
        const id = item.artifact.frontmatter.id;
        const kind = item.artifact.kind;
        const body = item.artifact.body.trim().slice(0, RESEARCHER_CONTEXT_BODY_CHARS);
        return `### ${id} (${kind})\n\n${body}`;
      }),
    ].join("\n\n");

    return {
      ...cmd,
      brief: { ...cmd.brief, context: contextBlock },
    };
  });
}

export async function runDiscover(options: DiscoverOptions): Promise<number> {
  const built = buildTarget(options);
  if ("error" in built) {
    console.error(built.error);
    return 1;
  }
  const target = built;

  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    console.error("Failed to load artifact snapshot");
    return 1;
  }

  const result = reconcileDiscovery(snapshot, target);
  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  const rawCommands = result.commands;
  if (rawCommands.length === 0) {
    console.log(explainDiscoveryIdle(snapshot, target));
    return 0;
  }

  const commands = enrichResearcherCommands(root, rawCommands);

  for (const cmd of commands) {
    console.log(formatCommand(cmd));
  }

  if (options.dryRun) {
    console.log("(dry-run: no agents executed)");
    return 0;
  }

  const cost = estimatePlanCostUsd(commands);
  const proceed = await confirmCostIfNeeded(
    cost,
    config.costConfirmThresholdUsd,
    options.yes ?? false,
  );
  if (!proceed) {
    console.log("Aborted.");
    return 1;
  }

  const invocationId = `${Date.now()}`;
  const repoHash = computeRepoHash(repoRoot);
  const sessionPath = sessionDir(repoHash, invocationId);
  fs.mkdirSync(sessionPath, { recursive: true });
  const verbose = options.verbose === true || config.verbose || isVerboseEnv();
  const logger = createLogger({
    verbose,
    logPath: ensureSessionLogPath(sessionPath),
  });
  const label = targetLabel(target);

  console.log(`Session: ~/.local/share/pet/${repoHash}/sessions/${invocationId}/`);
  console.log(`Log: ${ensureSessionLogPath(sessionPath)} (also: pet logs)`);
  logger.info(`discover ${label}: ${commands.map((c) => c.kind).join(", ")}`);
  if (config.mockAgents) {
    logger.info("PET_MOCK_AGENTS=1 — deterministic mock agents");
  } else {
    logger.info(`Live agents — provider ${resolveProvider()}, model ${resolveModelId()}`);
  }
  logger.outcome(`Planned API work: ${commands.map((c) => formatCommand(c)).join("; ")}`);

  if (options.noInk) {
    try {
      await executeCommands(root, commands, false, logger, options.callbacks);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
      return 1;
    }
    const validation = validateRepo(root, repoRoot);
    if (validation.isErr()) {
      console.error(formatReport(validation.error));
      return 1;
    }
    console.log("Discovery step completed. Validation passed.");
    return 0;
  }

  return renderAgentPanel({
    heading: `pet discover — ${label}`,
    runFn: async (callbacks) => {
      await executeCommands(root, commands, false, logger, callbacks);
      const validation = validateRepo(root, repoRoot);
      if (validation.isErr()) {
        throw new Error(formatReport(validation.error));
      }
      return 0;
    },
  });
}
