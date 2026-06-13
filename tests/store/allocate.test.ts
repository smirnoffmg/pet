import { describe, expect, it } from "vitest";

import { allocateNextId } from "@/store/allocate.js";
import type { ParsedArtifact } from "@/store/parse.js";

function makeArtifact(id: string, kind: ParsedArtifact["kind"]): ParsedArtifact {
  return {
    kind,
    filePath: `/doc/${id}.md`,
    relativePath: `product/00-problem-hypotheses/${id}.md`,
    frontmatter: { id, status: "proposed" } as ParsedArtifact["frontmatter"],
    body: "",
  };
}

describe("allocateNextId", () => {
  it("returns PROB-0001 when no artifacts exist", () => {
    expect(allocateNextId("hypothesis", [])).toBe("PROB-0001");
  });

  it("returns the next sequential ID after existing ones", () => {
    const artifacts = [makeArtifact("FEAT-0001", "feature"), makeArtifact("FEAT-0002", "feature")];
    expect(allocateNextId("feature", artifacts)).toBe("FEAT-0003");
  });

  it("handles non-sequential IDs by taking the max plus one", () => {
    const artifacts = [makeArtifact("FEAT-0001", "feature"), makeArtifact("FEAT-0003", "feature")];
    expect(allocateNextId("feature", artifacts)).toBe("FEAT-0004");
  });

  it("ignores artifacts of other kinds", () => {
    const artifacts = [
      makeArtifact("FEAT-0001", "feature"),
      makeArtifact("FEAT-0002", "feature"),
      makeArtifact("PROB-0005", "hypothesis"),
    ];
    expect(allocateNextId("feature", artifacts)).toBe("FEAT-0003");
    expect(allocateNextId("hypothesis", artifacts)).toBe("PROB-0006");
  });

  it("pads numeric suffix to 4 digits", () => {
    expect(allocateNextId("metric", [])).toBe("MET-0001");
  });
});
