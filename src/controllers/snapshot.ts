import { scanArtifacts } from "@/store/scan.js";
import type { ArtifactSnapshot } from "@/agents/types.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { ParsedArtifact } from "@/store/parse.js";
import {
  featureIdSchema,
  metricIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  releaseIdSchema,
} from "@/schemas/ids.js";

export function loadSnapshot(docRoot: string): ArtifactSnapshot | null {
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    return null;
  }

  const artifacts = scan.value;
  const metrics = artifacts.filter((a) => a.kind === "metric");
  const hypotheses = artifacts.filter((a) => a.kind === "hypothesis");
  const solutionHypotheses = artifacts.filter((a) => a.kind === "solution_hypothesis");
  const features = artifacts.filter((a) => a.kind === "feature");
  const tasks = artifacts.filter((a) => a.kind === "task");
  const releases = artifacts.filter((a) => a.kind === "release");
  const qaPlans = artifacts.filter((a) => a.kind === "qa_plan");

  const byMetricId = new Map<string, ParsedArtifact>();
  for (const m of metrics) {
    byMetricId.set(m.frontmatter.id, m);
  }

  const byHypothesisId = new Map<string, ParsedArtifact>();
  for (const h of hypotheses) {
    byHypothesisId.set(h.frontmatter.id, h);
  }

  const bySolutionHypothesisId = new Map<string, ParsedArtifact>();
  for (const sh of solutionHypotheses) {
    bySolutionHypothesisId.set(sh.frontmatter.id, sh);
  }

  const byFeatureId = new Map<string, ParsedArtifact>();
  for (const f of features) {
    byFeatureId.set(f.frontmatter.id, f);
  }

  const tasksByFeatureId = new Map<string, ParsedArtifact[]>();
  for (const t of tasks) {
    const fm = t.frontmatter;
    if (!("feature_id" in fm)) {
      continue;
    }
    const list = tasksByFeatureId.get(fm.feature_id) ?? [];
    list.push(t);
    tasksByFeatureId.set(fm.feature_id, list);
  }

  const byReleaseId = new Map<string, ParsedArtifact>();
  for (const r of releases) {
    byReleaseId.set(r.frontmatter.id, r);
  }

  const qaPlansByFeatureId = new Map<string, ParsedArtifact[]>();
  for (const qp of qaPlans) {
    const fm = qp.frontmatter;
    if (!("feature_id" in fm)) {
      continue;
    }
    const list = qaPlansByFeatureId.get(fm.feature_id) ?? [];
    list.push(qp);
    qaPlansByFeatureId.set(fm.feature_id, list);
  }

  return {
    metrics,
    hypotheses,
    solutionHypotheses,
    features,
    tasks,
    releases,
    qaPlansByFeatureId,
    byMetricId,
    byHypothesisId,
    bySolutionHypothesisId,
    byFeatureId,
    tasksByFeatureId,
    byReleaseId,
  };
}

export function getFeature(
  snapshot: ArtifactSnapshot,
  featureId: string,
): { feature: ParsedArtifact; frontmatter: FeatureFrontmatter } | null {
  const parsedId = featureIdSchema.safeParse(featureId);
  if (!parsedId.success) {
    return null;
  }
  const feature = snapshot.byFeatureId.get(parsedId.data);
  if (!feature || feature.kind !== "feature") {
    return null;
  }
  return {
    feature,
    frontmatter: feature.frontmatter as FeatureFrontmatter,
  };
}

export function getMetric(
  snapshot: ArtifactSnapshot,
  metricId: string,
): { metric: ParsedArtifact; frontmatter: TargetMetricFrontmatter } | null {
  const parsedId = metricIdSchema.safeParse(metricId);
  if (!parsedId.success) {
    return null;
  }
  const metric = snapshot.byMetricId.get(parsedId.data);
  if (!metric || metric.kind !== "metric") {
    return null;
  }
  return {
    metric,
    frontmatter: metric.frontmatter as TargetMetricFrontmatter,
  };
}

export function getHypothesis(
  snapshot: ArtifactSnapshot,
  hypothesisId: string,
): { hypothesis: ParsedArtifact; frontmatter: HypothesisFrontmatter } | null {
  const parsedId = problemHypothesisIdSchema.safeParse(hypothesisId);
  if (!parsedId.success) {
    return null;
  }
  const hypothesis = snapshot.byHypothesisId.get(parsedId.data);
  if (!hypothesis || hypothesis.kind !== "hypothesis") {
    return null;
  }
  return {
    hypothesis,
    frontmatter: hypothesis.frontmatter as HypothesisFrontmatter,
  };
}

export function getSolutionHypothesis(
  snapshot: ArtifactSnapshot,
  solutionHypothesisId: string,
): { solutionHypothesis: ParsedArtifact; frontmatter: SolutionHypothesisFrontmatter } | null {
  const parsedId = solutionHypothesisIdSchema.safeParse(solutionHypothesisId);
  if (!parsedId.success) {
    return null;
  }
  const sh = snapshot.bySolutionHypothesisId.get(parsedId.data);
  if (!sh || sh.kind !== "solution_hypothesis") {
    return null;
  }
  return {
    solutionHypothesis: sh,
    frontmatter: sh.frontmatter as SolutionHypothesisFrontmatter,
  };
}

export function getTask(
  snapshot: ArtifactSnapshot,
  taskId: string,
): { task: ParsedArtifact; frontmatter: DevTaskFrontmatter } | null {
  const all = snapshot.tasks;
  const match = all.find((t) => t.frontmatter.id === taskId);
  if (!match || match.kind !== "task") {
    return null;
  }
  return {
    task: match,
    frontmatter: match.frontmatter as DevTaskFrontmatter,
  };
}

export function hasTasksForFeature(snapshot: ArtifactSnapshot, featureId: string): boolean {
  return (snapshot.tasksByFeatureId.get(featureId) ?? []).length > 0;
}

export function hasOpenTasksForFeature(snapshot: ArtifactSnapshot, featureId: string): boolean {
  const tasks = snapshot.tasksByFeatureId.get(featureId) ?? [];
  return tasks.some((t) => {
    const status = t.frontmatter.status;
    return status !== "done";
  });
}

export function hasQaPlanForFeature(snapshot: ArtifactSnapshot, featureId: string): boolean {
  const plans = snapshot.qaPlansByFeatureId.get(featureId) ?? [];
  return plans.some((p) => {
    const s = p.frontmatter.status;
    return s === "proposed" || s === "accepted";
  });
}

export function getRelease(
  snapshot: ArtifactSnapshot,
  releaseId: string,
): { release: ParsedArtifact; frontmatter: ReleaseFrontmatter } | null {
  const parsedId = releaseIdSchema.safeParse(releaseId);
  if (!parsedId.success) {
    return null;
  }
  const release = snapshot.byReleaseId.get(parsedId.data);
  if (!release || release.kind !== "release") {
    return null;
  }
  return {
    release,
    frontmatter: release.frontmatter as ReleaseFrontmatter,
  };
}

export function releaseBodyHasDeploymentChecklist(body: string): boolean {
  return /^## Deployment Checklist/m.test(body);
}
