import path from "node:path";
import type { ArtifactKind } from "@/schemas/ids.js";

export const ADR_DIR = "adr";

export const ARTIFACT_DIR_BY_KIND: Record<ArtifactKind, string> = {
  metric: "product/01-metrics",
  hypothesis: "product/00-problem-hypotheses",
  solution_hypothesis: "product/02-solution-hypotheses",
  feature: "product/03-features",
  release: "product/06-releases",
  task: "product/04-tasks",
  qa_plan: "product/05-qa-plans",
};

export const ARTIFACT_SCAN_DIRS = [
  "product/01-metrics",
  "product/00-problem-hypotheses",
  "product/02-solution-hypotheses",
  "product/03-features",
  "product/06-releases",
  "product/04-tasks",
  "product/05-qa-plans",
] as const;

export const EXCLUDED_SCAN_DIRS = ["product/orchestration"] as const;

export function kindFromRelativePath(relativePath: string): ArtifactKind | null {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("product/01-metrics/")) {
    return "metric";
  }
  if (normalized.startsWith("product/00-problem-hypotheses/")) {
    return "hypothesis";
  }
  if (normalized.startsWith("product/02-solution-hypotheses/")) {
    return "solution_hypothesis";
  }
  if (normalized.startsWith("product/03-features/")) {
    return "feature";
  }
  if (normalized.startsWith("product/06-releases/")) {
    return "release";
  }
  if (
    normalized.startsWith("product/04-tasks/") &&
    !normalized.startsWith("product/04-tasks/archive/")
  ) {
    return "task";
  }
  if (normalized.startsWith("product/04-tasks/archive/")) {
    return "task";
  }
  if (normalized.startsWith("product/05-qa-plans/")) {
    return "qa_plan";
  }
  return null;
}

export function dirForKind(docRoot: string, kind: ArtifactKind): string {
  return path.join(docRoot, ARTIFACT_DIR_BY_KIND[kind]);
}

export function relativePathForKind(kind: ArtifactKind, filename: string): string {
  return path.join(ARTIFACT_DIR_BY_KIND[kind], filename);
}
