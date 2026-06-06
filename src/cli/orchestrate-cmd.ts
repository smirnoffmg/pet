import { reconcileOrchestrator } from "@/controllers/orchestrator.js";
import { loadSnapshot } from "@/controllers/snapshot.js";
import { appendOrchestrationDecision } from "@/controllers/orchestration-log.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import { estimatePlanCostUsd, confirmCostIfNeeded } from "@/agents/cost.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { loadConfig, sessionDir } from "@/config.js";
import { resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { createLogger, ensureSessionLogPath, isVerboseEnv } from "@/log.js";
import fs from "node:fs";

export type OrchestrateOptions = {
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
};

export async function runOrchestrate(options: OrchestrateOptions): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    console.error("Failed to load artifact snapshot");
    return 1;
  }

  const result = reconcileOrchestrator(snapshot);
  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  if (result.command === null) {
    if (result.idleReasons.length === 0) {
      console.log("Nothing to do — all artifacts are fully delivered or no work is pending.");
    } else {
      console.log("Waiting for human review:");
      for (const r of result.idleReasons) {
        console.log(`  • ${r}`);
      }
    }
    return 0;
  }

  const cmd = result.command;
  console.log(formatCommand(cmd));

  if (options.dryRun) {
    console.log("(dry-run: no agents executed)");
    return 0;
  }

  const cost = estimatePlanCostUsd([cmd]);
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
  const logger = createLogger({ verbose, logPath: ensureSessionLogPath(sessionPath) });

  console.log(`Session: ~/.local/share/pet/${repoHash}/sessions/${invocationId}/`);
  console.log(`Log: ${ensureSessionLogPath(sessionPath)} (also: pet logs)`);
  logger.info(`orchestrate: ${formatCommand(cmd)}`);
  if (config.mockAgents) {
    logger.info("PET_MOCK_AGENTS=1 — deterministic mock agents");
  } else {
    logger.info(`Live agents — provider ${resolveProvider()}, model ${resolveModelId()}`);
  }
  logger.outcome(`Planned API work: ${formatCommand(cmd)}`);

  try {
    await executeCommands(root, [cmd], false, logger);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    return 1;
  }

  appendOrchestrationDecision(root, `orchestrate: ${formatCommand(cmd)}`);

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log("Orchestration step completed. Validation passed.");
  return 0;
}
