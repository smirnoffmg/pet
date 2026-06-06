import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";
import { releaseIdSchema, featureIdSchema } from "@/schemas/ids.js";
import { releaseBodyHasDeploymentChecklist } from "./snapshot.js";

export type ReconcileResult =
  | { ok: true; commands: SubagentCommand[] }
  | { ok: false; reason: string };

export function reconcileRelease(
  _snapshot: ArtifactSnapshot,
  releaseId: string,
  releaseTitle: string,
  releaseBody: string,
  frontmatter: ReleaseFrontmatter,
): ReconcileResult {
  if (frontmatter.status !== "proposed") {
    return {
      ok: false,
      reason: `Release ${releaseId} cannot be enriched from status ${frontmatter.status} (only proposed releases need DevOps enrichment).`,
    };
  }

  if (releaseBodyHasDeploymentChecklist(releaseBody)) {
    return { ok: true, commands: [] };
  }

  const parsedReleaseId = releaseIdSchema.safeParse(releaseId);
  if (!parsedReleaseId.success) {
    return { ok: false, reason: `Invalid release ID: ${releaseId}` };
  }

  const featureIds = frontmatter.feature_ids.map((id) => featureIdSchema.parse(id));

  return {
    ok: true,
    commands: [
      {
        kind: "spawn_devops",
        brief: {
          releaseId: parsedReleaseId.data,
          releaseTitle,
          releaseBody,
          featureIds,
        },
      },
    ],
  };
}

export function explainReleaseIdle(releaseId: string, releaseBody: string): string {
  if (releaseBodyHasDeploymentChecklist(releaseBody)) {
    return `Release ${releaseId} already has a deployment checklist. Run \`pet accept release ${releaseId}\` to approve it.`;
  }
  return `Release ${releaseId} is not in a state that can be enriched.`;
}
