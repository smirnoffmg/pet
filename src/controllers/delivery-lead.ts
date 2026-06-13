import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import { solutionHypothesisIdSchema } from "@/schemas/ids.js";
import { extractTitle, asSolutionHypothesisFm } from "./discovery-helpers.js";
import { hasTasksForFeature } from "./snapshot.js";

export type ReconcileResult =
  | { ok: true; commands: SubagentCommand[] }
  | { ok: false; reason: string };

export function reconcileDelivery(
  snapshot: ArtifactSnapshot,
  featureId: string,
  featureTitle: string,
  featureBody: string,
  frontmatter: FeatureFrontmatter,
): ReconcileResult {
  if (frontmatter.status !== "accepted") {
    return {
      ok: false,
      reason: `Feature ${featureId} must be accepted before delivery (status: ${frontmatter.status}). Run \`pet accept feature ${featureId}\`.`,
    };
  }

  const review = frontmatter.architectural_review_status ?? "pending";

  if (review === "blocked") {
    return { ok: true, commands: [] };
  }

  const shId = frontmatter.solution_hypothesis_id;
  const shArtifact = shId ? snapshot.bySolutionHypothesisId.get(shId) : undefined;
  const shContext =
    shArtifact != null
      ? {
          solutionHypothesisId: solutionHypothesisIdSchema.parse(
            asSolutionHypothesisFm(shArtifact).id,
          ),
          solutionHypothesisTitle: extractTitle(shArtifact.body, shId!),
          solutionHypothesisBody: shArtifact.body,
        }
      : {};

  if (review === "pending") {
    return {
      ok: true,
      commands: [
        {
          kind: "spawn_architect",
          brief: { featureId: frontmatter.id, featureTitle, featureBody, ...shContext },
        },
      ],
    };
  }

  if (review === "cleared") {
    if (hasTasksForFeature(snapshot, featureId)) {
      return { ok: true, commands: [] };
    }
    return {
      ok: true,
      commands: [
        {
          kind: "spawn_techlead",
          brief: { featureId: frontmatter.id, featureTitle, featureBody, ...shContext },
        },
      ],
    };
  }

  return { ok: false, reason: `Unknown architectural_review_status: ${review}` };
}

/** Human-readable reason when reconcile returns no commands (not an error). */
export function explainDeliveryIdle(
  snapshot: ArtifactSnapshot,
  featureId: string,
  frontmatter: FeatureFrontmatter,
): string {
  const review = frontmatter.architectural_review_status ?? "pending";

  if (review === "blocked") {
    return `Feature ${featureId} is blocked by architectural review. Resolve the ADR or feature review before delivery.`;
  }

  if (review === "pending") {
    return `Feature ${featureId} is accepted but architectural review is still pending (unexpected idle state).`;
  }

  const tasks = snapshot.tasksByFeatureId.get(featureId) ?? [];
  const open = tasks.filter((t) => t.frontmatter.status !== "done");
  if (open.length > 0) {
    const statuses = open
      .map((t) => `${t.frontmatter.id} (${(t.frontmatter as DevTaskFrontmatter).status})`)
      .join(", ");
    return `Feature ${featureId} is accepted, architecturally cleared, and already has open task(s): ${statuses}. Delivery (Architect → TechLead) is complete — implement or close tasks next.`;
  }

  const done = tasks.filter((t) => t.frontmatter.status === "done");
  if (done.length > 0) {
    const doneIds = done.map((t) => t.frontmatter.id).join(", ");
    return `Feature ${featureId} is cleared with no open tasks (${doneIds} done). Nothing for DeliveryLead to spawn.`;
  }

  return `Feature ${featureId} is accepted and cleared but has no tasks (unexpected idle state).`;
}
