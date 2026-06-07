import { describe, it, expect } from "vitest";
import { readGitBranch } from "@/store/repo-root.js";

describe("readGitBranch", () => {
  it("returns a non-empty string for the current repo", () => {
    const branch = readGitBranch(process.cwd());
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });

  it("returns '(no branch)' for a non-git directory", () => {
    expect(readGitBranch("/tmp")).toBe("(no branch)");
  });
});
