import { describe, expect, it } from "vitest";
import { computeActions, computeArtifactActions } from "@/cli/next-cmd.js";
import type { ParsedArtifact } from "@/store/parse.js";

function makeArtifact(
  kind: string,
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
  body = `# ${id}`,
): ParsedArtifact {
  return {
    kind: kind as ParsedArtifact["kind"],
    filePath: `/fake/${id}.md`,
    relativePath: `${id}.md`,
    frontmatter: { id, status, ...extra } as ParsedArtifact["frontmatter"],
    body,
  };
}

// Minimal accepted feature with real (non-scaffold) body
function acceptedFeature(id: string, solId: string): ParsedArtifact {
  return makeArtifact(
    "feature",
    id,
    "accepted",
    { solution_hypothesis_id: solId },
    `# ${id}\n\nReal acceptance criteria.`,
  );
}

function doneTask(id: string, featureId: string): ParsedArtifact {
  return makeArtifact("task", id, "done", { feature_id: featureId });
}

function todoTask(id: string, featureId: string): ParsedArtifact {
  return makeArtifact("task", id, "todo", { feature_id: featureId });
}

describe("computeActions — QA pipeline (priority 9-10)", () => {
  it("emits accept qa-plan for a proposed QA plan", () => {
    const arts = [makeArtifact("qa_plan", "QA-0001", "proposed", { feature_id: "FEAT-0001" })];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet accept qa-plan QA-0001");
  });

  it("does not emit accept qa-plan for an accepted QA plan", () => {
    const arts = [makeArtifact("qa_plan", "QA-0001", "accepted", { feature_id: "FEAT-0001" })];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).not.toContain("pet accept qa-plan QA-0001");
  });

  it("emits pet qa --feature when all tasks are done and no QA plan exists", () => {
    const arts = [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("metric", "MET-0001", "accepted", { problem_hypothesis_id: "PROB-0001" }),
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        metric_ids: ["MET-0001"],
      }),
      acceptedFeature("FEAT-0001", "SOL-0001"),
      doneTask("TASK-0001", "FEAT-0001"),
      doneTask("TASK-0002", "FEAT-0001"),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet qa --feature FEAT-0001");
  });

  it("does not emit pet qa when a task is still in progress", () => {
    const arts = [
      acceptedFeature("FEAT-0001", "SOL-0001"),
      doneTask("TASK-0001", "FEAT-0001"),
      todoTask("TASK-0002", "FEAT-0001"),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands.some((c) => c.startsWith("pet qa"))).toBe(false);
  });

  it("does not emit pet qa when a QA plan already exists for the feature", () => {
    const arts = [
      acceptedFeature("FEAT-0001", "SOL-0001"),
      doneTask("TASK-0001", "FEAT-0001"),
      makeArtifact("qa_plan", "QA-0001", "proposed", { feature_id: "FEAT-0001" }),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands.some((c) => c.startsWith("pet qa"))).toBe(false);
  });

  it("does not emit pet qa when feature has no tasks", () => {
    const arts = [acceptedFeature("FEAT-0001", "SOL-0001")];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands.some((c) => c.startsWith("pet qa"))).toBe(false);
  });
});

describe("computeActions — hypothesis pipeline (priority 4)", () => {
  const scaffoldHypBody =
    "# Some Problem\n\n## Context\n\n## Decision\n\n## Evidence\n\n## How we measure\n\n## Consequences\n";

  const partialHypBody =
    "# Some Problem\n\n## Context\n\n## Decision\n\n## Evidence\n\nUsers report X constantly.\n\n## How we measure\n\n## Consequences\n";

  const fullHypBody =
    "# Some Problem\n\n## Context\n\nSeniors on large teams.\n\n## Decision\n\nWe believe X.\n\n## Evidence\n\nUsers report X.\n\n## How we measure\n\nTrack response latency.\n\n## Consequences\n\nPursue triage tooling.\n";

  it("emits discover for a proposed hypothesis with scaffold body", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "proposed", {}, scaffoldHypBody)];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet discover --hypothesis PROB-0001");
    expect(commands).not.toContain("pet accept hypothesis PROB-0001");
  });

  it("emits discover for a proposed hypothesis with partial content (some sections still empty)", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "proposed", {}, partialHypBody)];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet discover --hypothesis PROB-0001");
    expect(commands).not.toContain("pet accept hypothesis PROB-0001");
  });

  it("emits accept for a proposed hypothesis with all sections filled", () => {
    const arts = [makeArtifact("hypothesis", "PROB-0001", "proposed", {}, fullHypBody)];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet accept hypothesis PROB-0001");
    expect(commands).not.toContain("pet discover --hypothesis PROB-0001");
  });
});

describe("computeArtifactActions — per-artifact multi-action model", () => {
  const scaffold =
    "# T\n\n## Context\n\n## Decision\n\n## Evidence\n\n## How we measure\n\n## Consequences\n";
  const partial =
    "# T\n\n## Context\n\n## Decision\n\n## Evidence\n\nSome evidence.\n\n## How we measure\n\n## Consequences\n";
  const full =
    "# T\n\n## Context\n\nCtx.\n\n## Decision\n\nDecision.\n\n## Evidence\n\nEvidence.\n\n## How we measure\n\nMeasure.\n\n## Consequences\n\nConsequences.\n";

  // ── hypothesis ────────────────────────────────────────────────────────────
  it("proposed hypothesis scaffold → discover only", () => {
    const cmds = computeArtifactActions("PROB-0001", [
      makeArtifact("hypothesis", "PROB-0001", "proposed", {}, scaffold),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet discover --hypothesis PROB-0001"]);
  });

  it("proposed hypothesis partial → discover only (no accept yet)", () => {
    const cmds = computeArtifactActions("PROB-0001", [
      makeArtifact("hypothesis", "PROB-0001", "proposed", {}, partial),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet discover --hypothesis PROB-0001"]);
  });

  it("proposed hypothesis fully filled → discover + accept (both available)", () => {
    const cmds = computeArtifactActions("PROB-0001", [
      makeArtifact("hypothesis", "PROB-0001", "proposed", {}, full),
    ]).map((a) => a.command);
    expect(cmds).toContain("pet discover --hypothesis PROB-0001");
    expect(cmds).toContain("pet accept hypothesis PROB-0001");
  });

  it("accepted hypothesis with no SOL → discover to generate solution", () => {
    const cmds = computeArtifactActions("PROB-0001", [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet discover --hypothesis PROB-0001"]);
  });

  it("accepted hypothesis with active SOL → no actions", () => {
    const cmds = computeArtifactActions("PROB-0001", [
      makeArtifact("hypothesis", "PROB-0001", "accepted"),
      makeArtifact("metric", "MET-0001", "accepted", { problem_hypothesis_id: "PROB-0001" }),
      makeArtifact("solution_hypothesis", "SOL-0001", "proposed", {
        metric_ids: ["MET-0001"],
      }),
    ]).map((a) => a.command);
    expect(cmds).toHaveLength(0);
  });

  // ── solution hypothesis ───────────────────────────────────────────────────
  it("proposed SOL → accept", () => {
    const cmds = computeArtifactActions("SOL-0001", [
      makeArtifact("solution_hypothesis", "SOL-0001", "proposed", {
        problem_hypothesis_id: "PROB-0001",
      }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet accept solution-hypothesis SOL-0001"]);
  });

  it("accepted SOL with no features → discover to generate features", () => {
    const cmds = computeArtifactActions("SOL-0001", [
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        problem_hypothesis_id: "PROB-0001",
      }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet discover --solution-hypothesis SOL-0001"]);
  });

  it("accepted SOL with active feature → no actions", () => {
    const cmds = computeArtifactActions("SOL-0001", [
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        problem_hypothesis_id: "PROB-0001",
      }),
      makeArtifact("feature", "FEAT-0001", "proposed", { solution_hypothesis_id: "SOL-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toHaveLength(0);
  });

  // ── feature ───────────────────────────────────────────────────────────────
  it("proposed feature with scaffold body → discover to fill", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact("feature", "FEAT-0001", "proposed", { solution_hypothesis_id: "SOL-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet discover --feature FEAT-0001"]);
  });

  it("proposed feature with real body → accept only", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "proposed",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet accept feature FEAT-0001"]);
  });

  it("accepted feature with no tasks → deliver", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet deliver --feature FEAT-0001"]);
  });

  it("accepted feature with all tasks done and no QA plan → qa", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet qa --feature FEAT-0001"]);
  });

  it("accepted feature with done tasks + accepted QA plan + no release → new release", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("qa_plan", "QA-0001", "accepted", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toContain("pet new release --features FEAT-0001 Release FEAT-0001");
  });

  it("accepted feature with done tasks + proposed QA plan → no release yet", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("qa_plan", "QA-0001", "proposed", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds.some((c) => c.startsWith("pet new release"))).toBe(false);
    expect(cmds.some((c) => c.startsWith("pet qa"))).toBe(false);
  });

  it("accepted feature with done tasks + accepted QA plan + existing release → no new release", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("qa_plan", "QA-0001", "accepted", { feature_id: "FEAT-0001" }),
      makeArtifact("release", "REL-0001", "proposed", { feature_ids: ["FEAT-0001"] }),
    ]).map((a) => a.command);
    expect(cmds.some((c) => c.startsWith("pet new release"))).toBe(false);
  });

  it("superseded release does not block new release creation", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
      makeArtifact("qa_plan", "QA-0001", "accepted", { feature_id: "FEAT-0001" }),
      makeArtifact("release", "REL-0001", "superseded", { feature_ids: ["FEAT-0001"] }),
    ]).map((a) => a.command);
    expect(cmds).toContain("pet new release --features FEAT-0001 Release FEAT-0001");
  });

  it("accepted feature with in-progress task → no feature-level actions", () => {
    const cmds = computeArtifactActions("FEAT-0001", [
      makeArtifact(
        "feature",
        "FEAT-0001",
        "accepted",
        { solution_hypothesis_id: "SOL-0001" },
        "# F\n\nReal criteria.",
      ),
      makeArtifact("task", "TASK-0001", "in_progress", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toHaveLength(0);
  });

  // ── task / metric / qa_plan ───────────────────────────────────────────────
  it("todo task → develop", () => {
    const cmds = computeArtifactActions("TASK-0001", [
      makeArtifact("task", "TASK-0001", "todo", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet develop --task TASK-0001"]);
  });

  it("done task → no actions", () => {
    const cmds = computeArtifactActions("TASK-0001", [
      makeArtifact("task", "TASK-0001", "done", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toHaveLength(0);
  });

  it("proposed metric → accept", () => {
    const cmds = computeArtifactActions("MET-0001", [
      makeArtifact("metric", "MET-0001", "proposed"),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet accept metric MET-0001"]);
  });

  it("proposed qa_plan → accept", () => {
    const cmds = computeArtifactActions("QA-0001", [
      makeArtifact("qa_plan", "QA-0001", "proposed", { feature_id: "FEAT-0001" }),
    ]).map((a) => a.command);
    expect(cmds).toEqual(["pet accept qa-plan QA-0001"]);
  });
});

describe("computeActions — release pipeline (priority 11-12)", () => {
  it("emits pet release --release for a proposed release with scaffold body", () => {
    // Scaffold body = only title + section headers, no content
    const arts = [
      makeArtifact(
        "release",
        "REL-0001",
        "proposed",
        { feature_ids: ["FEAT-0001"] },
        "# REL-0001\n\n## Deployment Checklist\n\n## Rollback\n",
      ),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet release --release REL-0001");
  });

  it("emits pet accept release for a proposed release with real body", () => {
    const arts = [
      makeArtifact(
        "release",
        "REL-0001",
        "proposed",
        { feature_ids: ["FEAT-0001"] },
        "# REL-0001\n\n## Deployment Checklist\n\n- [ ] Deploy to staging\n- [ ] Run smoke tests\n",
      ),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands).toContain("pet accept release REL-0001");
    expect(commands).not.toContain("pet release --release REL-0001");
  });

  it("does not emit any release action for an accepted release", () => {
    const arts = [
      makeArtifact(
        "release",
        "REL-0001",
        "accepted",
        { feature_ids: ["FEAT-0001"] },
        "# REL-0001\n\n## Deployment Checklist\n\n- [ ] Deploy\n",
      ),
    ];
    const commands = computeActions(arts).map((a) => a.command);
    expect(commands.some((c) => c.includes("REL-0001"))).toBe(false);
  });
});
