import path from "node:path";
import { execSync } from "node:child_process";
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

  it("passes full pet doc tree when run from repo", (ctx) => {
    const repoRoot = path.join(__dirname, "..", "..");
    // Skip when doc/ has uncommitted changes — immutability checks compare against HEAD
    // and would false-fire during active schema migrations.
    try {
      execSync("git diff --exit-code HEAD -- doc/", { cwd: repoRoot, stdio: "ignore" });
    } catch {
      ctx.skip();
      return;
    }
    const docRoot = path.join(repoRoot, "doc");
    const result = validateRepo(docRoot, repoRoot);
    expect(result.isOk()).toBe(true);
  });
});
