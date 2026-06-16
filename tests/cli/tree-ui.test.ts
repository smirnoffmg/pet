import { describe, expect, it } from "vitest";
import { canMarkTaskDone, findArtifactRowIndex } from "@/cli/tree-ui.js";
import type { Row } from "@/cli/tree-ui.js";
import type { ParsedArtifact } from "@/store/parse.js";

function fakeArtifact(
  id: string,
  kind: ParsedArtifact["kind"] = "hypothesis",
  status = "proposed",
): ParsedArtifact {
  return {
    kind,
    filePath: `/doc/${id}.md`,
    relativePath: `${id}.md`,
    frontmatter: { id, status } as unknown as ParsedArtifact["frontmatter"],
    body: "",
  };
}

function artifactRow(
  id: string,
  depth: 0 | 1 | 2 | 3 = 0,
  kind: ParsedArtifact["kind"] = "hypothesis",
  status = "proposed",
): Extract<Row, { type: "artifact" }> {
  return {
    type: "artifact",
    artifact: fakeArtifact(id, kind, status),
    depth,
    hasChildren: false,
    isCollapsed: false,
  };
}

function actionRow(): Extract<Row, { type: "action" }> {
  return {
    type: "action",
    action: { command: "pet discover --hypothesis PROB-0001", reason: "test" },
    actionIndex: 0,
    depth: 0,
  };
}

describe("findArtifactRowIndex", () => {
  it("returns the index of the artifact row with the matching id", () => {
    const rows: Row[] = [
      artifactRow("PROB-0001"),
      artifactRow("SOL-0001"),
      artifactRow("SOL-0002"),
    ];
    expect(findArtifactRowIndex(rows, "SOL-0001")).toBe(1);
  });

  it("returns -1 when the id is not present", () => {
    const rows: Row[] = [artifactRow("PROB-0001"), artifactRow("SOL-0001")];
    expect(findArtifactRowIndex(rows, "SOL-0099")).toBe(-1);
  });

  it("returns -1 for an empty rows array", () => {
    expect(findArtifactRowIndex([], "PROB-0001")).toBe(-1);
  });

  it("skips action rows when scanning", () => {
    const rows: Row[] = [artifactRow("PROB-0001"), actionRow(), artifactRow("SOL-0001")];
    expect(findArtifactRowIndex(rows, "SOL-0001")).toBe(2);
  });

  it("returns the first matching index when id appears at depth 0", () => {
    const rows: Row[] = [
      artifactRow("SOL-0005", 1),
      artifactRow("FEAT-0005", 2),
      artifactRow("SOL-0006", 1),
      artifactRow("FEAT-0001", 2),
    ];
    expect(findArtifactRowIndex(rows, "SOL-0006")).toBe(2);
  });
});

describe("canMarkTaskDone", () => {
  it.each(["todo", "in_progress", "review"])(
    "returns true for a task row with status %s",
    (status) => {
      const row = artifactRow("TASK-0001", 3, "task", status);
      expect(canMarkTaskDone(row)).toBe(true);
    },
  );

  it("returns false for a task row already done", () => {
    const row = artifactRow("TASK-0001", 3, "task", "done");
    expect(canMarkTaskDone(row)).toBe(false);
  });

  it("returns false for a non-task artifact row", () => {
    const row = artifactRow("FEAT-0001", 2, "feature", "accepted");
    expect(canMarkTaskDone(row)).toBe(false);
  });

  it("returns false for an action row", () => {
    expect(canMarkTaskDone(actionRow())).toBe(false);
  });
});
