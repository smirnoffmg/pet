import type { ParsedArtifact } from "@/store/parse.js";
import type { ArtifactSnapshot } from "@/agents/types.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";
import type { QaPlanFrontmatter } from "@/schemas/qa-plan.js";
import { featureBodyIsScaffold } from "./discovery-helpers.js";
import { hasOpenTasksForFeature } from "./snapshot.js";
import { reconcileOrchestrator } from "./orchestrator.js";

function countByStatus(
  items: ParsedArtifact[],
  getStatus: (a: ParsedArtifact) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const s = getStatus(item);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return counts;
}

function fmtCounts(counts: Map<string, number>, order: readonly string[]): string {
  const parts: string[] = [];
  for (const status of order) {
    const n = counts.get(status) ?? 0;
    if (n > 0) parts.push(`${n} ${status}`);
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

export function analyzeProject(snapshot: ArtifactSnapshot): string {
  const lines: string[] = ["## Pipeline Analysis", ""];

  lines.push("### Artifact Counts");

  const hyps = snapshot.hypotheses;
  const hypCounts = countByStatus(hyps, (a) => (a.frontmatter as HypothesisFrontmatter).status);
  lines.push(
    `- **Hypotheses (PROB-):** ${hyps.length} total — ${fmtCounts(hypCounts, ["proposed", "accepted", "superseded"])}`,
  );

  const sols = snapshot.solutionHypotheses;
  const solCounts = countByStatus(
    sols,
    (a) => (a.frontmatter as SolutionHypothesisFrontmatter).status,
  );
  lines.push(
    `- **Solution Hypotheses (SOL-):** ${sols.length} total — ${fmtCounts(solCounts, ["proposed", "accepted", "superseded"])}`,
  );

  const feats = snapshot.features;
  const featCounts = countByStatus(feats, (a) => (a.frontmatter as FeatureFrontmatter).status);
  lines.push(
    `- **Features (FEAT-):** ${feats.length} total — ${fmtCounts(featCounts, ["proposed", "accepted", "superseded"])}`,
  );

  const tasks = snapshot.tasks;
  const taskCounts = countByStatus(tasks, (a) => (a.frontmatter as DevTaskFrontmatter).status);
  lines.push(
    `- **Tasks (TASK-):** ${tasks.length} total — ${fmtCounts(taskCounts, ["todo", "in_progress", "review", "done"])}`,
  );

  const qaPlans = [...snapshot.qaPlansByFeatureId.values()].flat();
  const qaCounts = countByStatus(qaPlans, (a) => (a.frontmatter as QaPlanFrontmatter).status);
  lines.push(
    `- **QA Plans (QA-):** ${qaPlans.length} total — ${fmtCounts(qaCounts, ["proposed", "accepted", "superseded"])}`,
  );

  const releases = snapshot.releases;
  const relCounts = countByStatus(releases, (a) => (a.frontmatter as ReleaseFrontmatter).status);
  lines.push(
    `- **Releases (REL-):** ${releases.length} total — ${fmtCounts(relCounts, ["proposed", "accepted", "shipped"])}`,
  );

  lines.push("", "### Pipeline Health");

  const scaffoldIds = feats
    .filter((f) => {
      const fm = f.frontmatter as FeatureFrontmatter;
      return (
        (fm.status === "accepted" || fm.status === "proposed") && featureBodyIsScaffold(f.body)
      );
    })
    .map((f) => f.frontmatter.id);
  lines.push(
    scaffoldIds.length === 0
      ? "- **Scaffold backlog:** none"
      : `- **Scaffold backlog (need DesignerEnrich):** ${scaffoldIds.join(", ")}`,
  );

  const awaitingReviewIds = feats
    .filter((f) => {
      const fm = f.frontmatter as FeatureFrontmatter;
      if (fm.status !== "accepted") return false;
      if (featureBodyIsScaffold(f.body)) return false;
      return (fm.architectural_review_status ?? "pending") === "pending";
    })
    .map((f) => f.frontmatter.id);
  lines.push(
    awaitingReviewIds.length === 0
      ? "- **Awaiting architectural review:** none"
      : `- **Awaiting architectural review:** ${awaitingReviewIds.join(", ")}`,
  );

  const blockedIds = feats
    .filter((f) => {
      const fm = f.frontmatter as FeatureFrontmatter;
      return fm.status === "accepted" && fm.architectural_review_status === "blocked";
    })
    .map((f) => f.frontmatter.id);
  lines.push(
    blockedIds.length === 0
      ? "- **Delivery blocked:** none"
      : `- **Delivery blocked:** ${blockedIds.join(", ")}`,
  );

  const openTaskFeatureIds = feats
    .filter((f) => {
      const fm = f.frontmatter as FeatureFrontmatter;
      return fm.status === "accepted" && hasOpenTasksForFeature(snapshot, fm.id);
    })
    .map((f) => f.frontmatter.id);
  lines.push(
    openTaskFeatureIds.length === 0
      ? "- **Features with open tasks:** none"
      : `- **Features with open tasks:** ${openTaskFeatureIds.join(", ")}`,
  );

  const result = reconcileOrchestrator(snapshot);
  if (result.ok && result.idleReasons.length > 0) {
    lines.push("", "### Pending Human Actions");
    for (const reason of result.idleReasons) {
      lines.push(`- ${reason}`);
    }
  } else if (result.ok && result.command !== null) {
    lines.push("", "### Next Automated Step");
    lines.push("- Pipeline can advance automatically — call `orchestrate_step` to proceed");
  }

  return lines.join("\n");
}
