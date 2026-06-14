import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { QaPlanFrontmatter } from "@/schemas/qa-plan.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";
import { featureBodyIsScaffold, anySectionEmpty } from "@/controllers/discovery-helpers.js";

export type Action = { command: string; reason: string };

type WithStatus = { id: string; status: string };

function fm(artifact: ParsedArtifact): WithStatus {
  return artifact.frontmatter as unknown as WithStatus;
}

function title(artifact: ParsedArtifact): string {
  const match = /^#[ \t]+(.+)$/m.exec(artifact.body);
  return match?.[1]?.trim() ?? artifact.frontmatter.id;
}

function proposed(a: ParsedArtifact): boolean {
  return fm(a).status === "proposed";
}

function accepted(a: ParsedArtifact): boolean {
  return fm(a).status === "accepted";
}

export function computeActions(artifacts: ParsedArtifact[]): Action[] {
  const actions: Action[] = [];

  const byKind = (kind: string) => artifacts.filter((a) => a.kind === kind);

  // Priority 1: proposed metrics (created by SolutionDesigner alongside SOL-)
  for (const a of byKind("metric").filter(proposed).sort(byId)) {
    actions.push({ command: `pet accept metric ${fm(a).id}`, reason: title(a) });
  }

  // Priority 2: proposed solution hypotheses
  for (const a of byKind("solution_hypothesis").filter(proposed).sort(byId)) {
    actions.push({
      command: `pet accept solution-hypothesis ${fm(a).id}`,
      reason: title(a),
    });
  }

  // Priority 3: proposed features
  for (const a of byKind("feature").filter(proposed).sort(byId)) {
    actions.push({ command: `pet accept feature ${fm(a).id}`, reason: title(a) });
  }

  // Priority 4: proposed hypotheses — discover if any section is still empty, accept if all filled
  for (const a of byKind("hypothesis").filter(proposed).sort(byId)) {
    if (anySectionEmpty(a.body)) {
      actions.push({ command: `pet discover --hypothesis ${fm(a).id}`, reason: title(a) });
    } else {
      actions.push({ command: `pet accept hypothesis ${fm(a).id}`, reason: title(a) });
    }
  }

  // Priority 5: todo/in_progress tasks that need dev enrichment
  for (const a of byKind("task")
    .filter((t) => fm(t).status === "todo" || fm(t).status === "in_progress")
    .sort(byId)) {
    actions.push({ command: `pet develop --task ${fm(a).id}`, reason: title(a) });
  }

  // Priority 6: accepted features that need delivery (scaffold body or no tasks)
  const taskFeatureIds = new Set(
    byKind("task").map((t) => (t.frontmatter as DevTaskFrontmatter).feature_id as string),
  );
  for (const a of byKind("feature").filter(accepted).sort(byId)) {
    const needsDeliver = featureBodyIsScaffold(a.body) || !taskFeatureIds.has(fm(a).id);
    if (needsDeliver) {
      actions.push({ command: `pet deliver --feature ${fm(a).id}`, reason: title(a) });
    }
  }

  // Priority 7: accepted SOL- with no proposed or accepted features
  const coveredSolIds = new Set(
    byKind("feature")
      .filter((a) => fm(a).status === "proposed" || fm(a).status === "accepted")
      .map((f) => (f.frontmatter as FeatureFrontmatter).solution_hypothesis_id as string)
      .filter(Boolean),
  );
  for (const a of byKind("solution_hypothesis").filter(accepted).sort(byId)) {
    if (!coveredSolIds.has(fm(a).id)) {
      actions.push({
        command: `pet discover --solution-hypothesis ${fm(a).id}`,
        reason: title(a),
      });
    }
  }

  // Priority 8: accepted PROB- with no SOL-
  const metricById = new Map<string, ParsedArtifact>(
    byKind("metric").map((m) => [m.frontmatter.id as string, m]),
  );
  const hypothesisIdsForSol = (sol: ParsedArtifact): string[] => {
    const ids = ((sol.frontmatter as SolutionHypothesisFrontmatter).metric_ids ?? []) as string[];
    return ids
      .map((mid) => metricById.get(mid))
      .filter(Boolean)
      .map((m) => (m!.frontmatter as TargetMetricFrontmatter).problem_hypothesis_id as string);
  };
  const hypIdsWithSol = new Set(
    byKind("solution_hypothesis")
      .filter((a) => fm(a).status !== "superseded")
      .flatMap(hypothesisIdsForSol),
  );
  for (const a of byKind("hypothesis").filter(accepted).sort(byId)) {
    if (!hypIdsWithSol.has(fm(a).id)) {
      actions.push({ command: `pet discover --hypothesis ${fm(a).id}`, reason: title(a) });
    }
  }

  // Priority 9: proposed QA plans → accept them
  for (const a of byKind("qa_plan").filter(proposed).sort(byId)) {
    actions.push({ command: `pet accept qa-plan ${fm(a).id}`, reason: title(a) });
  }

  // Priority 10: accepted features with all tasks done and no QA plan → run QA agent
  const featIdsWithQaPlan = new Set(
    byKind("qa_plan")
      .filter((a) => fm(a).status !== "superseded")
      .map((q) => (q.frontmatter as QaPlanFrontmatter).feature_id as string),
  );
  const tasksByFeatureId = new Map<string, ParsedArtifact[]>();
  for (const t of byKind("task")) {
    const fid = (t.frontmatter as DevTaskFrontmatter).feature_id as string;
    tasksByFeatureId.set(fid, [...(tasksByFeatureId.get(fid) ?? []), t]);
  }
  for (const a of byKind("feature").filter(accepted).sort(byId)) {
    const id = fm(a).id;
    if (featIdsWithQaPlan.has(id)) continue;
    const tasks = tasksByFeatureId.get(id) ?? [];
    const hasTasks = tasks.length > 0;
    const allDone = hasTasks && tasks.every((t) => fm(t).status === "done");
    if (allDone) {
      actions.push({ command: `pet qa --feature ${id}`, reason: title(a) });
    }
  }

  // Priority 11: proposed releases with scaffold body → run DevOps agent to enrich
  // Priority 12: proposed releases with real body → accept them
  // Note: featureBodyIsScaffold works here because release templates use the same
  // title + empty-section-header structure. If release templates gain pre-filled
  // content, introduce a dedicated releaseBodyIsScaffold instead.
  for (const a of byKind("release").filter(proposed).sort(byId)) {
    if (featureBodyIsScaffold(a.body)) {
      actions.push({ command: `pet release --release ${fm(a).id}`, reason: title(a) });
    } else {
      actions.push({ command: `pet accept release ${fm(a).id}`, reason: title(a) });
    }
  }

  return actions;
}

function byId(a: ParsedArtifact, b: ParsedArtifact): number {
  return a.frontmatter.id.localeCompare(b.frontmatter.id);
}

export function computeArtifactActions(
  artifactId: string,
  allArtifacts: ParsedArtifact[],
): Action[] {
  const artifact = allArtifacts.find((a) => fm(a).id === artifactId);
  if (!artifact) return [];
  return computeArtifactActionsFor(artifact, allArtifacts);
}

function computeArtifactActionsFor(
  artifact: ParsedArtifact,
  allArtifacts: ParsedArtifact[],
): Action[] {
  const { id, status } = fm(artifact);
  const actions: Action[] = [];

  switch (artifact.kind) {
    case "hypothesis": {
      if (status === "proposed") {
        actions.push({
          command: `pet discover --hypothesis ${id}`,
          reason: anySectionEmpty(artifact.body) ? "fill empty sections" : "re-run research",
        });
        if (!anySectionEmpty(artifact.body)) {
          actions.push({ command: `pet accept hypothesis ${id}`, reason: "lock and proceed" });
        }
      } else if (status === "accepted") {
        const metricByIdLocal = new Map(
          allArtifacts.filter((a) => a.kind === "metric").map((m) => [m.frontmatter.id, m]),
        );
        const hasSol = allArtifacts.some((a) => {
          if (a.kind !== "solution_hypothesis" || fm(a).status === "superseded") return false;
          return ((a.frontmatter as SolutionHypothesisFrontmatter).metric_ids ?? []).some((mid) => {
            const met = metricByIdLocal.get(mid);
            return met && (met.frontmatter as TargetMetricFrontmatter).problem_hypothesis_id === id;
          });
        });
        if (!hasSol) {
          actions.push({
            command: `pet discover --hypothesis ${id}`,
            reason: "generate solution hypothesis",
          });
        }
      }
      break;
    }

    case "solution_hypothesis": {
      if (status === "proposed") {
        actions.push({
          command: `pet accept solution-hypothesis ${id}`,
          reason: "lock and proceed",
        });
      } else if (status === "accepted") {
        const hasFeature = allArtifacts.some(
          (a) =>
            a.kind === "feature" &&
            (a.frontmatter as FeatureFrontmatter).solution_hypothesis_id === id &&
            (fm(a).status === "proposed" || fm(a).status === "accepted"),
        );
        if (!hasFeature) {
          actions.push({
            command: `pet discover --solution-hypothesis ${id}`,
            reason: "generate features",
          });
        }
      }
      break;
    }

    case "feature": {
      if (status === "proposed") {
        if (featureBodyIsScaffold(artifact.body)) {
          actions.push({ command: `pet discover --feature ${id}`, reason: "fill feature body" });
        } else {
          actions.push({ command: `pet accept feature ${id}`, reason: "lock and proceed" });
        }
      } else if (status === "accepted") {
        const tasks = allArtifacts.filter(
          (a) => a.kind === "task" && (a.frontmatter as DevTaskFrontmatter).feature_id === id,
        );
        if (featureBodyIsScaffold(artifact.body) || tasks.length === 0) {
          actions.push({ command: `pet deliver --feature ${id}`, reason: "generate tasks" });
        } else {
          const allDone = tasks.every((t) => fm(t).status === "done");
          const hasQaPlan = allArtifacts.some(
            (a) =>
              a.kind === "qa_plan" &&
              (a.frontmatter as QaPlanFrontmatter).feature_id === id &&
              fm(a).status !== "superseded",
          );
          if (allDone && !hasQaPlan) {
            actions.push({ command: `pet qa --feature ${id}`, reason: "generate QA plan" });
          }
          if (allDone && hasQaPlan) {
            const hasAcceptedQaPlan = allArtifacts.some(
              (a) =>
                a.kind === "qa_plan" &&
                (a.frontmatter as QaPlanFrontmatter).feature_id === id &&
                fm(a).status === "accepted",
            );
            if (hasAcceptedQaPlan) {
              const hasRelease = allArtifacts.some(
                (a) =>
                  a.kind === "release" &&
                  ((a.frontmatter as ReleaseFrontmatter).feature_ids as string[]).includes(id) &&
                  fm(a).status !== "superseded",
              );
              if (!hasRelease) {
                actions.push({
                  command: `pet new release --features ${id} Release ${id}`,
                  reason: "create release scaffold",
                });
              }
            }
          }
        }
      }
      break;
    }

    case "task": {
      if (status === "todo" || status === "in_progress") {
        actions.push({ command: `pet develop --task ${id}`, reason: "enrich task" });
      }
      break;
    }

    case "metric": {
      if (status === "proposed") {
        actions.push({ command: `pet accept metric ${id}`, reason: "" });
      }
      break;
    }

    case "qa_plan": {
      if (status === "proposed") {
        actions.push({ command: `pet accept qa-plan ${id}`, reason: "" });
      }
      break;
    }

    case "release": {
      if (status === "proposed") {
        if (featureBodyIsScaffold(artifact.body)) {
          actions.push({
            command: `pet release --release ${id}`,
            reason: "generate deployment checklist",
          });
        } else {
          actions.push({ command: `pet release --release ${id}`, reason: "re-run release agent" });
          actions.push({ command: `pet accept release ${id}`, reason: "lock and mark shipped" });
        }
      }
      break;
    }
  }

  return actions;
}

export function runNext(): number {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const actions = computeActions(scan.value);

  if (actions.length === 0) {
    console.log("Pipeline is idle — no pending actions.");
    return 0;
  }

  const [first, ...rest] = actions;
  console.log(`Next:\n  ${first!.command}`);
  console.log(`  # ${first!.reason}`);

  if (rest.length > 0) {
    console.log("\nAlso pending:");
    for (const action of rest) {
      console.log(`  ${action.command}`);
      console.log(`  # ${action.reason}`);
    }
  }

  return 0;
}
