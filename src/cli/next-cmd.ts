import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import { featureBodyIsScaffold } from "@/controllers/discovery-helpers.js";

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

  // Priority 4: proposed hypotheses
  for (const a of byKind("hypothesis").filter(proposed).sort(byId)) {
    actions.push({ command: `pet accept hypothesis ${fm(a).id}`, reason: title(a) });
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
  const hypIdsWithSol = new Set(
    byKind("solution_hypothesis")
      .filter((a) => fm(a).status !== "superseded")
      .map((s) => (s.frontmatter as SolutionHypothesisFrontmatter).problem_hypothesis_id as string),
  );
  for (const a of byKind("hypothesis").filter(accepted).sort(byId)) {
    if (!hypIdsWithSol.has(fm(a).id)) {
      actions.push({ command: `pet discover --hypothesis ${fm(a).id}`, reason: title(a) });
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
  return computeActions(allArtifacts).filter((a) => a.command.includes(artifactId));
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
