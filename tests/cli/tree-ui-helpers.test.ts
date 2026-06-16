import { describe, expect, it } from "vitest";
import { nextAutoCommand } from "@/cli/tree-ui.js";
import type { ParsedArtifact } from "@/store/parse.js";

function makeArtifact(
  kind: string,
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
): ParsedArtifact {
  return {
    kind: kind as ParsedArtifact["kind"],
    filePath: `/fake/${id}.md`,
    relativePath: `${id}.md`,
    frontmatter: { id, status, ...extra } as ParsedArtifact["frontmatter"],
    body: `# ${id}`,
  };
}

describe("nextAutoCommand", () => {
  it("returns null for non-accept commands", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "accepted")];
    expect(nextAutoCommand("pet discover --hypothesis PROB-0001", arts)).toBeNull();
  });

  it("returns discover command after accepting a hypothesis with no SOL", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "accepted")];
    expect(nextAutoCommand("pet accept hypothesis PROB-0001", arts)).toBe(
      "pet discover --hypothesis PROB-0001",
    );
  });

  it("returns null when next action is another accept (HITL gate)", () => {
    // After accepting a hypothesis, a SOL is already proposed — next action is accept sol
    const arts = [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("metric", "MET-0001", "accepted", { problem_hypothesis_id: "PROB-0001" }),
      makeArtifact("solution_hypothesis", "SOL-0001", "proposed", {
        metric_ids: ["MET-0001"],
      }),
    ];
    // next action will be "pet accept solution-hypothesis SOL-0001"
    expect(nextAutoCommand("pet accept hypothesis PROB-0001", arts)).toBeNull();
  });

  it("returns null when artifact ID cannot be extracted from command", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "accepted")];
    expect(nextAutoCommand("pet accept hypothesis", arts)).toBeNull();
  });

  it("returns deliver command after accepting a feature", () => {
    const arts = [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        problem_hypothesis_id: "PROB-0001",
      }),
      makeArtifact("feature", "FEAT-0001", "accepted", {
        solution_hypothesis_id: "SOL-0001",
      }),
    ];
    const result = nextAutoCommand("pet accept feature FEAT-0001", arts);
    expect(result).toBe("pet deliver --feature FEAT-0001");
  });

  it("returns null when there are no actions for the artifact", () => {
    // Accepted hypothesis that already has an accepted SOL — no discover needed
    const arts = [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("metric", "MET-0001", "accepted", { problem_hypothesis_id: "PROB-0001" }),
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        metric_ids: ["MET-0001"],
      }),
      {
        kind: "feature" as ParsedArtifact["kind"],
        filePath: "/fake/FEAT-0001.md",
        relativePath: "FEAT-0001.md",
        frontmatter: {
          id: "FEAT-0001",
          status: "accepted",
          solution_hypothesis_id: "SOL-0001",
        } as ParsedArtifact["frontmatter"],
        body: "# FEAT-0001\n\nThis feature is fully described with real acceptance criteria.",
      },
    ];
    // PROB-0001 has a SOL, so no discover action for it
    expect(nextAutoCommand("pet accept hypothesis PROB-0001", arts)).toBeNull();
  });

  it("returns discover command after accepting a solution hypothesis with no feature", () => {
    const arts = [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        problem_hypothesis_id: "PROB-0001",
      }),
    ];
    expect(nextAutoCommand("pet accept solution-hypothesis SOL-0001", arts)).toBe(
      "pet discover --solution-hypothesis SOL-0001",
    );
  });
});

describe("nextAutoCommand — pet task done", () => {
  const acceptedFeature = makeArtifact("feature", "FEAT-0001", "accepted", {
    solution_hypothesis_id: "SOL-0001",
  });
  acceptedFeature.body = "# FEAT-0001\n\nThis feature is fully described with real criteria.";

  it("returns qa command after marking the last remaining task of a feature done", () => {
    const arts = [
      acceptedFeature,
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
    ];
    expect(nextAutoCommand("pet task done TASK-0001", arts)).toBe("pet qa --feature FEAT-0001");
  });

  it("returns null when other tasks for the feature are still pending", () => {
    const arts = [
      acceptedFeature,
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("task", "TASK-0002", "todo", { feature_id: "FEAT-0001" }),
    ];
    expect(nextAutoCommand("pet task done TASK-0001", arts)).toBeNull();
  });

  it("returns null when the feature already has a QA plan", () => {
    const arts = [
      acceptedFeature,
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("qa_plan", "QA-0001", "proposed", { feature_id: "FEAT-0001" }),
    ];
    expect(nextAutoCommand("pet task done TASK-0001", arts)).toBeNull();
  });

  it("returns null when the task id cannot be extracted from the command", () => {
    const arts = [acceptedFeature, makeArtifact("task", "TASK-0001", "done", {})];
    expect(nextAutoCommand("pet task done", arts)).toBeNull();
  });

  it("returns null when the completed task cannot be found", () => {
    const arts = [acceptedFeature];
    expect(nextAutoCommand("pet task done TASK-0099", arts)).toBeNull();
  });
});
