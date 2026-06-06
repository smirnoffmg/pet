import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateRepo } from "@/validators/validate-repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "fixtures");

describe("validateRepo", () => {
  it("passes valid fixture doc tree", () => {
    const docRoot = path.join(fixtures, "doc-valid");
    const result = validateRepo(docRoot, docRoot);
    expect(result.isOk()).toBe(true);
  });

  it("fails broken FK fixture", () => {
    const docRoot = path.join(fixtures, "doc-broken-fk");
    const result = validateRepo(docRoot, docRoot);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.issues.some((i) => i.code === "fk")).toBe(true);
    }
  });

  it("passes full pet doc tree when run from repo", () => {
    const repoRoot = path.join(__dirname, "..", "..");
    const docRoot = path.join(repoRoot, "doc");
    const result = validateRepo(docRoot, repoRoot);
    expect(result.isOk()).toBe(true);
  });
});
