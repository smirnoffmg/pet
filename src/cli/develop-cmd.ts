import { reconcileDevelop } from "@/controllers/develop-lead.js";
import { loadSnapshot, getTask, getFeature } from "@/controllers/snapshot.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import type { ExecuteCallbacks } from "@/agents/executor.js";
import { renderAgentPanel } from "@/cli/render-agent-panel.js";
import { estimatePlanCostUsd, confirmCostIfNeeded } from "@/agents/cost.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { loadConfig, sessionDir } from "@/config.js";
import { resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { createLogger, ensureSessionLogPath, isVerboseEnv } from "@/log.js";
import fs from "node:fs";

export type DevelopOptions = {
  task: string;
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  noInk?: boolean;
  callbacks?: ExecuteCallbacks;
};

export async function runDevelop(options: DevelopOptions): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    console.error("Failed to load artifact snapshot");
    return 1;
  }

  const taskResult = getTask(snapshot, options.task);
  if (!taskResult) {
    console.error(`Task not found: ${options.task}`);
    return 1;
  }

  const featureResult = getFeature(snapshot, taskResult.frontmatter.feature_id);
  if (!featureResult) {
    console.error(`Linked feature not found: ${taskResult.frontmatter.feature_id}`);
    return 1;
  }

  const titleMatch = /^#\s+(.+)$/m.exec(taskResult.task.body);
  const taskTitle = titleMatch?.[1]?.trim() ?? options.task;

  const featureTitleMatch = /^#\s+(.+)$/m.exec(featureResult.feature.body);
  const featureTitle = featureTitleMatch?.[1]?.trim() ?? taskResult.frontmatter.feature_id;

  const result = reconcileDevelop(
    snapshot,
    options.task,
    taskTitle,
    taskResult.task.body,
    taskResult.frontmatter.feature_id,
    featureTitle,
    featureResult.feature.body,
    taskResult.frontmatter,
  );

  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  const commands = result.commands;
  if (commands.length === 0) {
    console.log(`Task ${options.task} has no pending enrichment.`);
    return 0;
  }

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

  console.log(`Session: ~/.local/share/pet/${repoHash}/sessions/${invocationId}/`);
  console.log(`Log: ${ensureSessionLogPath(sessionPath)} (also: pet logs)`);
  logger.info(`develop ${options.task}: ${commands.map((c) => c.kind).join(", ")}`);
  if (config.mockAgents) {
    logger.info("PET_MOCK_AGENTS=1 — deterministic mock agents");
  } else {
    logger.info(`Live agents — provider ${resolveProvider()}, model ${resolveModelId()}`);
  }

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
    console.log("Dev enrichment completed. Validation passed.");
    return 0;
  }

  return renderAgentPanel({
    heading: `pet develop — ${options.task}`,
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
