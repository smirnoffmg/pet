import type { SubagentCommand } from "./types.js";
import { loadConfig } from "@/config.js";
import type { PdtLogger } from "@/log.js";
import { captureDocSnapshot, diffDocSnapshot } from "./doc-snapshot.js";
import { appendOrchestrationDecision } from "@/controllers/orchestration-log.js";
import {
  runMockAnalyst,
  runMockArchitect,
  runMockSolutionDesigner,
  runMockFeatureDesigner,
  runMockDesignerEnrich,
  runMockResearcher,
  runMockTechLead,
  runMockDev,
  runMockQa,
  runMockDevOps,
} from "./mock-runner.js";
import { runLiveAgent } from "./run-agent.js";
import type { ToolCallEvent } from "./run-agent.js";
import type { AgentRole } from "./path-permissions.js";

const KIND_TO_ROLE: Record<SubagentCommand["kind"], AgentRole> = {
  spawn_architect: "architect",
  spawn_techlead: "techlead",
  spawn_analyst: "analyst",
  spawn_researcher: "researcher",
  spawn_solution_designer: "solution_designer",
  spawn_feature_designer: "designer",
  spawn_designer_enrich: "designer",
  spawn_dev: "dev",
  spawn_qa: "qa",
  spawn_devops: "devops",
};

function trunc(s: string, n = 60): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}

export function formatCommand(cmd: SubagentCommand): string {
  switch (cmd.kind) {
    case "spawn_architect":
      return `spawn Architect for ${cmd.brief.featureId} "${trunc(cmd.brief.featureTitle)}"`;
    case "spawn_techlead":
      return `spawn TechLead for ${cmd.brief.featureId} "${trunc(cmd.brief.featureTitle)}"`;
    case "spawn_analyst":
      return `spawn Analyst for ${cmd.brief.metricId} "${trunc(cmd.brief.metricTitle)}"`;
    case "spawn_researcher":
      return `spawn Researcher for ${cmd.brief.hypothesisId} "${trunc(cmd.brief.hypothesisTitle)}"`;
    case "spawn_solution_designer":
      return `spawn SolutionDesigner for ${cmd.brief.hypothesisId} "${trunc(cmd.brief.hypothesisTitle)}"`;
    case "spawn_feature_designer":
      return `spawn FeatureDesigner for ${cmd.brief.solutionHypothesisId} "${trunc(cmd.brief.solutionHypothesisTitle)}"`;
    case "spawn_designer_enrich":
      return `spawn Designer(enrich) for ${cmd.brief.featureId} "${trunc(cmd.brief.featureTitle)}" via ${cmd.brief.solutionHypothesisId}`;
    case "spawn_dev":
      return `spawn Dev for ${cmd.brief.taskId} "${trunc(cmd.brief.taskTitle)}" (${cmd.brief.featureId})`;
    case "spawn_qa":
      return `spawn QA for ${cmd.brief.featureId} "${trunc(cmd.brief.featureTitle)}" [${cmd.brief.tasks.map((t) => t.taskId).join(", ")}]`;
    case "spawn_devops":
      return `spawn DevOps for ${cmd.brief.releaseId} "${trunc(cmd.brief.releaseTitle)}" [${cmd.brief.features.map((f) => f.featureId).join(", ")}]`;
  }
}

export type ExecuteCallbacks = {
  onAgentStart?: (role: string) => void;
  onToolCall?: (e: ToolCallEvent) => void;
  onLogPath?: (logPath: string) => void;
};

export async function executeCommands(
  docRoot: string,
  commands: SubagentCommand[],
  dryRun: boolean,
  logger: PdtLogger,
  callbacks?: ExecuteCallbacks,
): Promise<void> {
  if (dryRun) {
    return;
  }

  const config = loadConfig();
  for (const cmd of commands) {
    const cmdStart = Date.now();
    logger.outcome(`▶ ${formatCommand(cmd)}`);
    const before = captureDocSnapshot(docRoot);

    try {
      if (config.mockAgents) {
        logger.verbose("Using mock agent (PET_MOCK_AGENTS=1)");
        runMockCommand(docRoot, cmd);
      } else {
        const role = KIND_TO_ROLE[cmd.kind];
        callbacks?.onAgentStart?.(role);
        await runLiveAgent(role, docRoot, cmd.brief, logger, cmd.kind, callbacks?.onToolCall);
      }
    } catch (e) {
      const elapsed = ((Date.now() - cmdStart) / 1000).toFixed(1);
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error && e.stack ? `\n${e.stack}` : "";
      logger.outcome(`✗ ${formatCommand(cmd)} FAILED after ${elapsed}s: ${msg}${stack}`);
      throw e;
    }

    const elapsed = ((Date.now() - cmdStart) / 1000).toFixed(1);
    const changes = diffDocSnapshot(before, captureDocSnapshot(docRoot));
    if (changes.length > 0) {
      logger.outcome(`Artifacts changed:\n${changes.map((c) => `  ${c}`).join("\n")}`);
    } else {
      logger.outcome("Artifacts changed: (none detected under doc/)");
    }

    const changesLine = changes.length > 0 ? changes.join(", ") : "(no artifact changes)";
    appendOrchestrationDecision(docRoot, `${formatCommand(cmd)} → ${changesLine}`);

    logger.outcome(`✓ ${formatCommand(cmd)} (${elapsed}s)`);
  }
}

function runMockCommand(docRoot: string, cmd: SubagentCommand): void {
  switch (cmd.kind) {
    case "spawn_architect":
      runMockArchitect(docRoot, cmd.brief);
      break;
    case "spawn_techlead":
      runMockTechLead(docRoot, cmd.brief);
      break;
    case "spawn_analyst":
      runMockAnalyst(docRoot, cmd.brief);
      break;
    case "spawn_researcher":
      runMockResearcher(docRoot, cmd.brief);
      break;
    case "spawn_solution_designer":
      runMockSolutionDesigner(docRoot, cmd.brief);
      break;
    case "spawn_feature_designer":
      runMockFeatureDesigner(docRoot, cmd.brief);
      break;
    case "spawn_designer_enrich":
      runMockDesignerEnrich(docRoot, cmd.brief);
      break;
    case "spawn_dev":
      runMockDev(docRoot, cmd.brief);
      break;
    case "spawn_qa":
      runMockQa(docRoot, cmd.brief);
      break;
    case "spawn_devops":
      runMockDevOps(docRoot, cmd.brief);
      break;
  }
}
