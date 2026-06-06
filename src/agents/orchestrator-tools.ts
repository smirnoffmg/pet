import { z } from "zod";
import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { reconcileOrchestrator } from "@/controllers/orchestrator.js";
import { loadSnapshot } from "@/controllers/snapshot.js";
import { analyzeProject } from "@/controllers/analyze.js";
import { appendOrchestrationDecision } from "@/controllers/orchestration-log.js";
import { executeCommands, formatCommand } from "@/agents/executor.js";
import {
  runAcceptHypothesis,
  runAcceptSolutionHypothesis,
  runAcceptFeature,
  runAcceptAdr,
  runAcceptMetric,
  runAcceptQaPlan,
  runAcceptRelease,
} from "@/cli/accept-cmd.js";
import fs from "node:fs";
import pathModule from "node:path";
import {
  scanArtifacts,
  allocateNextId,
  writeArtifact,
  nextAdrNumber,
  adrTemplate,
  buildFilename,
  ADR_DIR,
} from "@/store/index.js";
import { problemHypothesisIdSchema, metricIdSchema } from "@/schemas/ids.js";
import type { HypothesisFrontmatter, TargetMetricFrontmatter } from "@/schemas/index.js";
import type { PdtLogger } from "@/log.js";

export function createOrchestratorTools(
  docRoot: string,
  logger: PdtLogger,
): StructuredToolInterface[] {
  const orchestrateStep = tool(
    async () => {
      const snapshot = loadSnapshot(docRoot);
      if (!snapshot) {
        return "Failed to load artifact snapshot.";
      }

      const result = reconcileOrchestrator(snapshot);
      if (!result.ok) {
        return `Orchestrator error: ${result.reason}`;
      }

      if (result.command === null) {
        if (result.idleReasons.length === 0) {
          return "Pipeline is idle — all artifacts are fully delivered or no work is pending.";
        }
        return `Waiting for human review:\n${result.idleReasons.map((r) => `• ${r}`).join("\n")}`;
      }

      const cmd = result.command;
      const description = formatCommand(cmd);

      try {
        await executeCommands(docRoot, [cmd], false, logger);
      } catch (e) {
        return `Failed to execute ${description}: ${e instanceof Error ? e.message : String(e)}`;
      }

      return `Executed: ${description}`;
    },
    {
      name: "orchestrate_step" as const,
      description:
        "Advance the pipeline by one step: determines the next subagent to spawn (researcher, solution designer, feature designer, architect, techlead, dev, qa, or devops) and executes it.",
      // Zod v3 _def.description typed as `string|undefined`; ZodV3ObjectLike expects
      // `description?: string`. Under exactOptionalPropertyTypes these differ but are
      // runtime-equivalent. Suppressing the false-positive.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      schema: z.object({}),
    },
  ) as unknown as StructuredToolInterface;

  const acceptArtifact = tool(
    async ({ kind, id }: { kind: string; id: string }) => {
      let code: number;
      switch (kind) {
        case "hypothesis":
          code = await runAcceptHypothesis(id, { yes: true });
          break;
        case "solution-hypothesis":
          code = await runAcceptSolutionHypothesis(id, { yes: true });
          break;
        case "feature":
          code = await runAcceptFeature(id, { yes: true });
          break;
        case "adr":
          code = await runAcceptAdr(id, { yes: true });
          break;
        case "metric":
          code = await runAcceptMetric(id, { yes: true });
          break;
        case "qa-plan":
          code = await runAcceptQaPlan(id, { yes: true });
          break;
        case "release":
          code = await runAcceptRelease(id, { yes: true });
          break;
        default:
          return `Unknown artifact kind: ${kind}. Valid kinds: hypothesis, solution-hypothesis, feature, adr, metric, qa-plan, release.`;
      }
      return code === 0
        ? `Accepted ${kind} ${id}.`
        : `Failed to accept ${kind} ${id} (exit ${code}).`;
    },
    {
      name: "accept_artifact" as const,
      description:
        "Accept (promote) a proposed artifact through its HITL gate. Provide the artifact kind and ID. For ADRs provide the number (e.g. 13). Valid kinds: hypothesis, solution-hypothesis, feature, adr, metric, qa-plan, release.",
      // @ts-expect-error Zod v3 / ZodV3ObjectLike exactOptionalPropertyTypes mismatch (runtime-safe)
      schema: z.object({
        kind: z.string().describe("Artifact kind, e.g. hypothesis, feature, adr"),
        id: z.string().describe("Artifact ID (e.g. PROB-0006, FEAT-0016) or ADR number (e.g. 13)"),
      }),
    },
  ) as unknown as StructuredToolInterface;

  const analyzePipeline = tool(
    () => {
      const snapshot = loadSnapshot(docRoot);
      if (!snapshot) {
        return "Failed to load artifact snapshot.";
      }
      return analyzeProject(snapshot);
    },
    {
      name: "analyze_pipeline" as const,
      description:
        "Return a structured health snapshot of the product pipeline: artifact counts by status, scaffold backlog, architectural review state, delivery blockers, open tasks, and pending human actions.",
      // @ts-expect-error Zod v3 / ZodV3ObjectLike exactOptionalPropertyTypes mismatch (runtime-safe)
      schema: z.object({}),
    },
  ) as unknown as StructuredToolInterface;

  const createArtifact = tool(
    ({ kind, title }: { kind: string; title: string }) => {
      const scanResult = scanArtifacts(docRoot);
      if (scanResult.isErr()) {
        return `Failed to scan artifacts: ${scanResult.error.message}`;
      }
      const artifacts = scanResult.value;

      let result: ReturnType<typeof writeArtifact>;
      switch (kind) {
        case "hypothesis": {
          const id = problemHypothesisIdSchema.parse(allocateNextId("hypothesis", artifacts));
          const fm: HypothesisFrontmatter = { id, status: "proposed", target_metric_ids: [] };
          result = writeArtifact(docRoot, "hypothesis", fm, title);
          break;
        }
        case "metric": {
          const id = metricIdSchema.parse(allocateNextId("metric", artifacts));
          const fm: TargetMetricFrontmatter = { id, status: "proposed" };
          result = writeArtifact(docRoot, "metric", fm, title);
          break;
        }
        case "adr": {
          const n = nextAdrNumber(docRoot);
          const date = new Date().toISOString().slice(0, 10);
          const filename = buildFilename(n, title);
          const filePath = pathModule.join(docRoot, ADR_DIR, filename);
          fs.mkdirSync(pathModule.join(docRoot, ADR_DIR), { recursive: true });
          if (fs.existsSync(filePath)) {
            return `File already exists: ${filePath}`;
          }
          fs.writeFileSync(filePath, adrTemplate(n, title, date), "utf8");
          appendOrchestrationDecision(docRoot, `create_artifact: adr "${title}"`);
          return `Created adr at ${filePath}`;
        }
        default:
          return `Unsupported kind: ${kind}. Supported: hypothesis, metric, adr. For other artifact types use the CLI: pet new <kind>.`;
      }

      if (result.isErr()) {
        return `Failed to create ${kind}: ${result.error.message}`;
      }
      appendOrchestrationDecision(docRoot, `create_artifact: ${kind} "${title}"`);
      return `Created ${kind} at ${result.value}`;
    },
    {
      name: "create_artifact" as const,
      description:
        "Create a new artifact scaffold. Supported kinds: hypothesis, metric, adr. Hypotheses and metrics use YAML frontmatter; ADRs use Michael Nygard format (no frontmatter). After creation you can run orchestrate_step to advance the pipeline.",
      // @ts-expect-error Zod v3 / ZodV3ObjectLike exactOptionalPropertyTypes mismatch (runtime-safe)
      schema: z.object({
        kind: z.string().describe("Artifact kind: hypothesis, metric, or adr"),
        title: z.string().describe("Human-readable title for the artifact"),
      }),
    },
  ) as unknown as StructuredToolInterface;

  return [orchestrateStep, acceptArtifact, analyzePipeline, createArtifact];
}
