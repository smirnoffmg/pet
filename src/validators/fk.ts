import type { ArtifactIndex } from "@/store/scan.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { ArtifactId } from "@/schemas/ids.js";
import { issue, type ValidationReport } from "./report.js";

function refExists(index: ArtifactIndex, id: string): boolean {
  return index.has(id as ArtifactId);
}

export function validateForeignKeys(
  artifacts: ParsedArtifact[],
  index: ArtifactIndex,
): ValidationReport {
  const issues = [];

  for (const artifact of artifacts) {
    const fm = artifact.frontmatter;
    const id = fm.id;

    if (artifact.kind === "hypothesis" && "target_metric_ids" in fm) {
      for (const metricId of fm.target_metric_ids) {
        if (!refExists(index, metricId)) {
          issues.push(
            issue("fk", `target_metric_ids entry ${metricId} does not exist`, {
              artifactId: id,
              filePath: artifact.filePath,
            }),
          );
        }
      }
      const acceptedStatuses = new Set(["accepted", "validated", "invalidated"]);
      if (
        acceptedStatuses.has(fm.status as string) &&
        (fm.target_metric_ids as unknown[]).length === 0
      ) {
        issues.push(
          issue("fk", "accepted hypothesis must have at least one target_metric_id", {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }

    if (artifact.kind === "solution_hypothesis") {
      if ("problem_hypothesis_id" in fm && !refExists(index, fm.problem_hypothesis_id)) {
        issues.push(
          issue("fk", `problem_hypothesis_id ${fm.problem_hypothesis_id} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }

      if (
        "target_metric_id" in fm &&
        fm.target_metric_id != null &&
        !refExists(index, fm.target_metric_id)
      ) {
        issues.push(
          issue("fk", `target_metric_id ${fm.target_metric_id} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }

    if (artifact.kind === "feature") {
      if ("solution_hypothesis_id" in fm && fm.solution_hypothesis_id != null) {
        if (!refExists(index, fm.solution_hypothesis_id)) {
          issues.push(
            issue("fk", `solution_hypothesis_id ${fm.solution_hypothesis_id} does not exist`, {
              artifactId: id,
              filePath: artifact.filePath,
            }),
          );
        }
      }
    }

    if (artifact.kind === "task" && "feature_id" in fm) {
      if (!refExists(index, fm.feature_id)) {
        issues.push(
          issue("fk", `feature_id ${fm.feature_id} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }

    if (artifact.kind === "release" && "feature_ids" in fm) {
      for (const featureId of fm.feature_ids) {
        if (!refExists(index, featureId)) {
          issues.push(
            issue("fk", `feature_ids entry ${featureId} does not exist`, {
              artifactId: id,
              filePath: artifact.filePath,
            }),
          );
        }
      }
    }

    if (artifact.kind === "qa_plan" && "feature_id" in fm) {
      if (!refExists(index, fm.feature_id)) {
        issues.push(
          issue("fk", `feature_id ${fm.feature_id} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }

    if ("supersedes" in fm && fm.supersedes) {
      if (!refExists(index, fm.supersedes)) {
        issues.push(
          issue("fk", `supersedes ${fm.supersedes} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }

    if ("superseded_by" in fm && fm.superseded_by) {
      if (!refExists(index, fm.superseded_by)) {
        issues.push(
          issue("fk", `superseded_by ${fm.superseded_by} does not exist`, {
            artifactId: id,
            filePath: artifact.filePath,
          }),
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
