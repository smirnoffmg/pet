import { describe, expect, it } from "vitest";
import { computeActions } from "@/cli/next-cmd.js";
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
      makeArtifact("solution_hypothesis", "SOL-0001", "accepted", {
        problem_hypothesis_id: "PROB-0001",
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
