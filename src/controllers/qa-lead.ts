import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import { featureIdSchema, taskIdSchema } from "@/schemas/ids.js";
import { extractTitle } from "./discovery-helpers.js";
import { hasQaPlanForFeature } from "./snapshot.js";

export type ReconcileResult =
  | { ok: true; commands: SubagentCommand[] }
  | { ok: false; reason: string };

export function reconcileQa(
  snapshot: ArtifactSnapshot,
  featureId: string,
  featureTitle: string,
  featureBody: string,
  frontmatter: FeatureFrontmatter,
): ReconcileResult {
  if (frontmatter.status !== "accepted") {
    return {
      ok: false,
      reason: `Feature ${featureId} must be accepted before QA (status: ${frontmatter.status}). Run \`pet accept feature ${featureId}\`.`,
    };
  }

  const allTasks = snapshot.tasksByFeatureId.get(featureId) ?? [];
  const doneTasks = allTasks.filter((t) => (t.frontmatter as DevTaskFrontmatter).status === "done");
  if (doneTasks.length === 0) {
    return {
      ok: false,
      reason: `Feature ${featureId} has no completed tasks. Implement and archive tasks before running QA.`,
    };
  }

  if (hasQaPlanForFeature(snapshot, featureId)) {
    return {
      ok: true,
      commands: [],
    };
  }

  const parsedFeatureId = featureIdSchema.safeParse(featureId);
  if (!parsedFeatureId.success) {
    return { ok: false, reason: `Invalid feature ID: ${featureId}` };
  }

  const tasks = doneTasks.map((t) => ({
    taskId: taskIdSchema.parse(t.frontmatter.id),
    taskTitle: extractTitle(t.body, t.frontmatter.id),
    taskBody: t.body,
  }));

  return {
    ok: true,
    commands: [
      {
        kind: "spawn_qa",
        brief: {
          featureId: parsedFeatureId.data,
          featureTitle,
          featureBody,
          tasks,
        },
      },
    ],
  };
}

export function explainQaIdle(snapshot: ArtifactSnapshot, featureId: string): string {
  if (hasQaPlanForFeature(snapshot, featureId)) {
    const plans = snapshot.qaPlansByFeatureId.get(featureId) ?? [];
    const ids = plans.map((p) => p.frontmatter.id).join(", ");
    return `Feature ${featureId} already has a QA plan (${ids}). Run \`pet accept qa-plan <id>\` to promote it.`;
  }
  return `Feature ${featureId} has no completed tasks yet. Implement tasks first.`;
}
