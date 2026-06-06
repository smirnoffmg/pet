import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateFilenames } from "@/validators/filename.js";
import type { ParsedArtifact } from "@/store/parse.js";

function artifact(
  filePath: string,
  id: string,
  kind: ParsedArtifact["kind"] = "metric",
): ParsedArtifact {
  return {
    kind,
    filePath,
    relativePath: filePath,
    frontmatter: { id, status: "proposed" } as ParsedArtifact["frontmatter"],
    body: "",
  };
}

describe("validateFilenames", () => {
  it("passes valid filename matching id", () => {
    const report = validateFilenames([artifact("/doc/product/01-metrics/0001-foo.md", "MET-0001")]);
    expect(report.ok).toBe(true);
  });

  it("fails when filename prefix mismatches id", () => {
    const report = validateFilenames([
      artifact(path.join("/doc/product/01-metrics/0002-foo.md"), "MET-0001"),
    ]);
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe("filename");
  });
});
