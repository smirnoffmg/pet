import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import { taskIdSchema, featureIdSchema } from "@/schemas/ids.js";

export type ReconcileResult =
  | { ok: true; commands: SubagentCommand[] }
  | { ok: false; reason: string };

export function reconcileDevelop(
  _snapshot: ArtifactSnapshot,
  taskId: string,
  taskTitle: string,
  taskBody: string,
  featureId: string,
  featureTitle: string,
  featureBody: string,
  frontmatter: DevTaskFrontmatter,
): ReconcileResult {
  if (frontmatter.status === "done") {
    return {
      ok: false,
      reason: `Task ${taskId} is already done. Archive it with \`git mv\` and update frontmatter.`,
    };
  }

  const parsedTaskId = taskIdSchema.safeParse(taskId);
  if (!parsedTaskId.success) {
    return { ok: false, reason: `Invalid task ID: ${taskId}` };
  }

  const parsedFeatureId = featureIdSchema.safeParse(featureId);
  if (!parsedFeatureId.success) {
    return { ok: false, reason: `Invalid feature ID: ${featureId}` };
  }

  return {
    ok: true,
    commands: [
      {
        kind: "spawn_dev",
        brief: {
          taskId: parsedTaskId.data,
          taskTitle,
          taskBody,
          featureId: parsedFeatureId.data,
          featureTitle,
          featureBody,
        },
      },
    ],
  };
}
