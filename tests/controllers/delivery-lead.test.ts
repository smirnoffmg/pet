import { describe, expect, it } from "vitest";
import { reconcileDelivery, explainDeliveryIdle } from "@/controllers/delivery-lead.js";
import type { ArtifactSnapshot } from "@/agents/types.js";
import type { ParsedArtifact } from "@/store/parse.js";
import { featureIdSchema, solutionHypothesisIdSchema, taskIdSchema } from "@/schemas/ids.js";

function featureArtifact(
  id: string,
  status: "proposed" | "accepted",
  review: "pending" | "cleared" | "blocked",
): ParsedArtifact {
  return {
    kind: "feature",
    filePath: `/doc/product/03-features/${id}.md`,
    relativePath: `product/03-features/${id}.md`,
    frontmatter: {
      id: featureIdSchema.parse(id),
      status,
      solution_hypothesis_id: solutionHypothesisIdSchema.parse("SOL-0001"),
      architectural_review_status: review,
    },
    body: "# Test feature\n",
  };
}

function emptySnapshot(features: ParsedArtifact[]): ArtifactSnapshot {
  return {
    metrics: [],
    hypotheses: [],
    solutionHypotheses: [],
    features,
    tasks: [],
    releases: [],
    qaPlansByFeatureId: new Map(),
    byMetricId: new Map(),
    byHypothesisId: new Map(),
    bySolutionHypothesisId: new Map(),
    byFeatureId: new Map(features.map((f) => [f.frontmatter.id, f])),
    tasksByFeatureId: new Map(),
    byReleaseId: new Map(),
  };
}

describe("reconcileDelivery", () => {
  it("spawns Architect when review is pending", () => {
    const snap = emptySnapshot([featureArtifact("FEAT-0001", "accepted", "pending")]);
    const result = reconcileDelivery(
      snap,
      "FEAT-0001",
      "Title",
      "body",
      snap.byFeatureId.get("FEAT-0001")!.frontmatter as never,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]?.kind).toBe("spawn_architect");
    }
  });

  it("spawns TechLead when cleared and no tasks exist", () => {
    const snap = emptySnapshot([featureArtifact("FEAT-0001", "accepted", "cleared")]);
    const fm = snap.byFeatureId.get("FEAT-0001")!.frontmatter;
    const result = reconcileDelivery(snap, "FEAT-0001", "Title", "body", fm as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_techlead");
    }
  });

  it("returns empty when blocked", () => {
    const snap = emptySnapshot([featureArtifact("FEAT-0001", "accepted", "blocked")]);
    const fm = snap.byFeatureId.get("FEAT-0001")!.frontmatter;
    const result = reconcileDelivery(snap, "FEAT-0001", "Title", "body", fm as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(0);
    }
  });

  it("returns empty when cleared and done tasks exist", () => {
    const feature = featureArtifact("FEAT-0001", "accepted", "cleared");
    const taskEntry = {
      kind: "task" as const,
      filePath: "/doc/product/04-tasks/archive/0001.md",
      relativePath: "product/04-tasks/archive/0001.md",
      frontmatter: {
        id: taskIdSchema.parse("TASK-0001"),
        status: "done" as const,
        feature_id: featureIdSchema.parse("FEAT-0001"),
      },
      body: "",
    };
    const snap: ArtifactSnapshot = {
      ...emptySnapshot([feature]),
      tasks: [taskEntry],
      tasksByFeatureId: new Map([["FEAT-0001", [taskEntry]]]),
    };
    const fm = snap.byFeatureId.get("FEAT-0001")!.frontmatter;
    const result = reconcileDelivery(snap, "FEAT-0001", "Title", "body", fm as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(0);
    }
  });

  it("returns empty when cleared and open tasks exist", () => {
    const feature = featureArtifact("FEAT-0001", "accepted", "cleared");
    const snap: ArtifactSnapshot = {
      ...emptySnapshot([feature]),
      tasks: [
        {
          kind: "task",
          filePath: "/doc/product/04-tasks/0001.md",
          relativePath: "product/04-tasks/0001.md",
          frontmatter: {
            id: taskIdSchema.parse("TASK-0001"),
            status: "todo",
            feature_id: featureIdSchema.parse("FEAT-0001"),
          },
          body: "",
        },
      ],
      tasksByFeatureId: new Map([
        [
          "FEAT-0001",
          [
            {
              kind: "task",
              filePath: "/doc/product/04-tasks/0001.md",
              relativePath: "product/04-tasks/0001.md",
              frontmatter: {
                id: taskIdSchema.parse("TASK-0001"),
                status: "todo",
                feature_id: featureIdSchema.parse("FEAT-0001"),
              },
              body: "",
            },
          ],
        ],
      ]),
    };
    const fm = snap.byFeatureId.get("FEAT-0001")!.frontmatter;
    const result = reconcileDelivery(snap, "FEAT-0001", "Title", "body", fm as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(0);
    }
    const msg = explainDeliveryIdle(snap, "FEAT-0001", fm as never);
    expect(msg).toContain("TASK-0001");
    expect(msg).toContain("cleared");
  });

  it("rejects non-accepted feature", () => {
    const snap = emptySnapshot([featureArtifact("FEAT-0001", "proposed", "pending")]);
    const fm = snap.byFeatureId.get("FEAT-0001")!.frontmatter;
    const result = reconcileDelivery(snap, "FEAT-0001", "Title", "body", fm as never);
    expect(result.ok).toBe(false);
  });
});
