import { reconcileDelivery, explainDeliveryIdle } from "@/controllers/delivery-lead.js";
import { loadSnapshot, getFeature } from "@/controllers/snapshot.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import type { ExecuteCallbacks } from "@/agents/executor.js";
import { renderAgentPanel } from "@/cli/render-agent-panel.js";
import { estimatePlanCostUsd, confirmCostIfNeeded } from "@/agents/cost.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { loadConfig, sessionDir } from "@/config.js";
import { resolveModelId, resolveProvider } from "@/llm/provider-factory.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { createLogger, ensureSessionLogPath, isVerboseEnv } from "@/log.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import fs from "node:fs";

export type DeliverOptions = {
  feature: string;
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  noInk?: boolean;
  callbacks?: ExecuteCallbacks;
};

export async function runDeliver(options: DeliverOptions): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    console.error("Failed to load artifact snapshot");
    return 1;
  }

  const feature = getFeature(snapshot, options.feature);
  if (!feature) {
    console.error(`Feature not found: ${options.feature}`);
    return 1;
  }

  const titleMatch = /^#\s+(.+)$/m.exec(feature.feature.body);
  const featureTitle = titleMatch?.[1]?.trim() ?? options.feature;

  const result = reconcileDelivery(
    snapshot,
    options.feature,
    featureTitle,
    feature.feature.body,
    feature.frontmatter,
  );

  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }

  const commands = result.commands;
  if (commands.length === 0) {
    console.log(explainDeliveryIdle(snapshot, options.feature, feature.frontmatter));
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
  logger.info(`deliver ${options.feature}: ${commands.map((c) => c.kind).join(", ")}`);
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
    // Guard: delivery agents must not revert the feature's accepted status.
    const postScan = scanArtifacts(root);
    if (postScan.isOk()) {
      const feat = postScan.value.find(
        (a) => a.kind === "feature" && a.frontmatter.id === options.feature,
      );
      if (feat && (feat.frontmatter as FeatureFrontmatter).status !== "accepted") {
        console.error(
          `Delivery agent reverted feature ${options.feature} status from "accepted" to "${(feat.frontmatter as FeatureFrontmatter).status}". Aborting — check architect output and re-run.`,
        );
        return 1;
      }
    }
    console.log("Delivery step completed. Validation passed.");
    return 0;
  }

  return renderAgentPanel({
    heading: `pet deliver — ${options.feature}`,
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
