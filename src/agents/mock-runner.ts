import fs from "node:fs";
import matter from "gray-matter";
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
import { scanArtifacts, allocateNextId, writeArtifact } from "@/store/index.js";
import {
  taskIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  metricIdSchema,
  featureIdSchema,
  qaPlanIdSchema,
} from "@/schemas/ids.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { QaPlanFrontmatter } from "@/schemas/qa-plan.js";

export function runMockArchitect(docRoot: string, brief: ArchitectBrief): void {
  const featurePath = findArtifactPath(docRoot, "feature", brief.featureId);
  if (!featurePath) {
    throw new Error(`Feature file not found for ${brief.featureId}`);
  }
  const raw = fs.readFileSync(featurePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["architectural_review_status"] = "cleared";
  fs.writeFileSync(featurePath, matter.stringify(parsed.content, data), "utf8");
}

export function runMockTechLead(docRoot: string, brief: TechLeadBrief): void {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  const id = allocateNextId("task", scan.value);
  const fm: DevTaskFrontmatter = {
    id: taskIdSchema.parse(id),
    status: "todo",
    feature_id: brief.featureId,
  };
  const title = `Implement ${brief.featureTitle}`;
  const result = writeArtifact(docRoot, "task", fm, title);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
}

export function runMockAnalyst(docRoot: string, brief: AnalystBrief): void {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  const id = allocateNextId("hypothesis", scan.value);
  const fm: HypothesisFrontmatter = {
    id: problemHypothesisIdSchema.parse(id),
    status: "proposed",
  };
  const title = `Hypothesis for ${brief.metricTitle}`;
  const result = writeArtifact(docRoot, "hypothesis", fm, title);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
}

export function runMockResearcher(docRoot: string, brief: ResearcherBrief): void {
  const hypPath = findArtifactPath(docRoot, "hypothesis", brief.hypothesisId);
  if (!hypPath) {
    throw new Error(`Hypothesis not found: ${brief.hypothesisId}`);
  }
  const raw = fs.readFileSync(hypPath, "utf8");
  const parsed = matter(raw);
  // Always write mock evidence regardless of current content (simulates Researcher
  // both filling empty Evidence and augmenting pre-existing Evidence).
  const body = parsed.content.replace(
    /## Evidence\s*\n[\s\S]*?(?=\n## |$)/i,
    "## Evidence\n\nMock research: metric trend supports this hypothesis for Phase 2 dogfood.\n",
  );
  fs.writeFileSync(hypPath, matter.stringify(body, parsed.data), "utf8");
}

export function runMockSolutionDesigner(docRoot: string, brief: SolutionDesignerBrief): void {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }

  let metricIds = brief.metrics.map((m) => m.metricId);
  if (metricIds.length === 0) {
    const newMetricId = allocateNextId("metric", scan.value);
    const metricFm: TargetMetricFrontmatter = {
      id: metricIdSchema.parse(newMetricId),
      status: "proposed",
      problem_hypothesis_id: brief.hypothesisId,
    };
    const metricResult = writeArtifact(
      docRoot,
      "metric",
      metricFm,
      `Metric for ${brief.hypothesisTitle}`,
    );
    if (metricResult.isErr()) {
      throw new Error(metricResult.error.message);
    }
    metricIds = [metricIdSchema.parse(newMetricId)];
  }

  const id = allocateNextId("solution_hypothesis", scan.value);
  const fm: SolutionHypothesisFrontmatter = {
    id: solutionHypothesisIdSchema.parse(id),
    status: "proposed",
    metric_ids: metricIds,
  };
  const title = `Solution for ${brief.hypothesisTitle}`;
  const result = writeArtifact(docRoot, "solution_hypothesis", fm, title);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
}

export function runMockFeatureDesigner(docRoot: string, brief: FeatureDesignerBrief): void {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  const id = allocateNextId("feature", scan.value);
  const fm: FeatureFrontmatter = {
    id: featureIdSchema.parse(id),
    status: "proposed",
    solution_hypothesis_id: solutionHypothesisIdSchema.parse(brief.solutionHypothesisId),
    architectural_review_status: "pending",
  };
  const title = `Feature for ${brief.solutionHypothesisTitle}`;
  const result = writeArtifact(docRoot, "feature", fm, title);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
}

export function runMockDesignerEnrich(docRoot: string, brief: DesignerEnrichBrief): void {
  const featurePath = findArtifactPath(docRoot, "feature", brief.featureId);
  if (!featurePath) {
    throw new Error(`Feature not found: ${brief.featureId}`);
  }
  const title = brief.featureTitle;
  const body = `# ${title}

## Context

Mock enrich: supports solution hypothesis ${brief.solutionHypothesisId} (${brief.solutionHypothesisTitle}).

## Decision

Complete the feature body with discovery-mode Designer enrichment for dogfood.

## Acceptance criteria

- Context, Decision, Acceptance criteria, and Consequences are non-empty
- \`pet validate\` passes after enrich

## Consequences

- Feature is ready for \`pet deliver\` without empty scaffold sections
`;
  const raw = fs.readFileSync(featurePath, "utf8");
  const parsed = matter(raw);
  fs.writeFileSync(featurePath, matter.stringify(body, parsed.data), "utf8");
}

export function runMockDev(docRoot: string, brief: DevBrief): void {
  const taskPath = findArtifactPath(docRoot, "task", brief.taskId);
  if (!taskPath) {
    throw new Error(`Task file not found for ${brief.taskId}`);
  }
  const raw = fs.readFileSync(taskPath, "utf8");
  const parsed = matter(raw);
  const body = `# ${brief.taskTitle}

## Description

Mock Dev: implement ${brief.taskTitle} as part of ${brief.featureId} (${brief.featureTitle}).

## Notes

Sub-steps:
1. Identify the relevant modules in the codebase
2. Implement the core logic following existing patterns
3. Add or update tests to cover the new behavior
`;
  fs.writeFileSync(taskPath, matter.stringify(body, parsed.data), "utf8");
}

export function runMockQa(docRoot: string, brief: QaBrief): void {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  const id = allocateNextId("qa_plan", scan.value);
  const fm: QaPlanFrontmatter = {
    id: qaPlanIdSchema.parse(id),
    status: "proposed",
    feature_id: brief.featureId,
  };
  const title = `QA plan for ${brief.featureTitle}`;
  const result = writeArtifact(docRoot, "qa_plan", fm, title);
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
}

export function runMockDevOps(docRoot: string, brief: DevOpsBrief): void {
  const releasePath = findArtifactPath(docRoot, "release", brief.releaseId);
  if (!releasePath) {
    throw new Error(`Release file not found for ${brief.releaseId}`);
  }
  const raw = fs.readFileSync(releasePath, "utf8");
  const parsed = matter(raw);
  const body =
    parsed.content.trimEnd() +
    `

## Deployment Checklist

Mock DevOps: deploy ${brief.releaseId} (${brief.releaseTitle}).

1. Run \`pet validate\` — ensure all artifacts are valid
2. Merge all feature branches to main
3. Tag the release commit
4. Deploy to staging, run smoke tests
5. Deploy to production

## Rollback Plan

1. Revert the release tag
2. Re-deploy the previous tagged release
3. Notify stakeholders
`;
  fs.writeFileSync(releasePath, matter.stringify(body, parsed.data), "utf8");
}

function findArtifactPath(docRoot: string, kind: string, artifactId: string): string | null {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    return null;
  }
  const match = scan.value.find((a) => a.kind === kind && a.frontmatter.id === artifactId);
  return match?.filePath ?? null;
}
