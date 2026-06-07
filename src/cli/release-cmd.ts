import { reconcileRelease, explainReleaseIdle } from "@/controllers/release-lead.js";
import { loadSnapshot, getRelease } from "@/controllers/snapshot.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import { renderAgentPanel } from "@/cli/render-agent-panel.js";
import { estimatePlanCostUsd, confirmCostIfNeeded } from "@/agents/cost.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { loadConfig, sessionDir } from "@/config.js";
import { resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { createLogger, ensureSessionLogPath, isVerboseEnv } from "@/log.js";
import fs from "node:fs";

export type ReleaseOptions = {
  release: string;
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  noInk?: boolean;
};

export async function runRelease(options: ReleaseOptions): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    console.error("Failed to load artifact snapshot");
    return 1;
  }

  const releaseResult = getRelease(snapshot, options.release);
  if (!releaseResult) {
    console.error(`Release not found: ${options.release}`);
    return 1;
  }

  const titleMatch = /^#\s+(.+)$/m.exec(releaseResult.release.body);
  const releaseTitle = titleMatch?.[1]?.trim() ?? options.release;

  const result = reconcileRelease(
    snapshot,
    options.release,
    releaseTitle,
    releaseResult.release.body,
    releaseResult.frontmatter,
  );

  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  const commands = result.commands;
  if (commands.length === 0) {
    console.log(explainReleaseIdle(options.release, releaseResult.release.body));
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
  logger.info(`release ${options.release}: ${commands.map((c) => c.kind).join(", ")}`);
  if (config.mockAgents) {
    logger.info("PET_MOCK_AGENTS=1 — deterministic mock agents");
  } else {
    logger.info(`Live agents — provider ${resolveProvider()}, model ${resolveModelId()}`);
  }

  if (options.noInk) {
    try {
      await executeCommands(root, commands, false, logger);
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
    console.log("Release enrichment completed. Validation passed.");
    return 0;
  }

  return renderAgentPanel({
    heading: `pet release — ${options.release}`,
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
