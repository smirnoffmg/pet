import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDevOpsFixture } from "../helpers/devops-fixture.js";
import { snapshotFixture, assertNoChange } from "../helpers/fixture-diff.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const petJs = path.join(repoRoot, "dist", "pet.js");

function runPdt(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PET_MOCK_AGENTS: "1" },
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return { status: r.status, stdout, stderr, combined: stdout + stderr };
}

describe("FEAT-0017 DevOps correctness (mock mode)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("T1: happy-path — proposed release gets deployment checklist and rollback plan", () => {
    const ctx = createDevOpsFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["release", "--release", "REL-0001", "--yes"]);
      expect(result.status, result.combined).toBe(0);

      const current = snapshotFixture(ctx.root);
      const relPath = "06-releases/0001-rel-proposed-scaffold.md";

      const snapRelease = snapshot.get(relPath)!;
      const currRelease = current.get(relPath)!;

      // Release body must have changed
      expect(currRelease, "release body must be enriched").not.toBe(snapRelease);

      // Must contain deployment checklist and rollback plan
      expect(currRelease, "must have ## Deployment Checklist").toMatch(/^## Deployment Checklist/m);
      expect(currRelease, "must have ## Rollback Plan").toMatch(/^## Rollback Plan/m);

      // Frontmatter must be identical (DevOps must not change status)
      expect(currRelease, "release must still be proposed").toMatch(/status: proposed/);
      expect(currRelease, "release must still have REL-0001").toMatch(/id: REL-0001/);

      // No other files changed (excluding orchestration log)
      for (const [rel, content] of snapshot) {
        if (rel === "orchestration/decisions.md") continue;
        if (rel === relPath) continue;
        const curr = current.get(rel);
        expect(curr, `side-effect: ${rel} must not change`).toBe(content);
      }

      // No new files created
      for (const rel of current.keys()) {
        if (rel === "orchestration/decisions.md") continue;
        if (rel === relPath) continue;
        expect(snapshot.has(rel), `unexpected new file: ${rel}`).toBe(true);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T2: gate-abort — accepted release exits non-zero with no file changes", () => {
    const ctx = createDevOpsFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["release", "--release", "REL-0002", "--yes"]);

      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T3: gate-abort — nonexistent release exits non-zero with no file changes", () => {
    const ctx = createDevOpsFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["release", "--release", "REL-9999", "--yes"]);

      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T4: idempotent — already-enriched release returns idle with no changes", () => {
    const ctx = createDevOpsFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      // First run — enriches the release
      const result1 = runPdt(cwd, ["release", "--release", "REL-0001", "--yes"]);
      expect(result1.status, result1.combined).toBe(0);

      const snapshot2 = snapshotFixture(ctx.root);

      // Second run — must return idle (checklist already present)
      const result2 = runPdt(cwd, ["release", "--release", "REL-0001", "--yes"]);
      expect(result2.status, result2.combined).toBe(0);
      expect(result2.combined, "second run must report idle").toMatch(
        /deployment checklist|already has|idle|nothing/i,
      );

      // Exactly zero new file changes on second run
      assertNoChange(snapshot2, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T5: volume run — five fixture invocations all enrich the release", () => {
    let passCount = 0;
    for (let i = 0; i < 5; i++) {
      const ctx = createDevOpsFixture();
      const cwd = path.resolve(ctx.root, "..", "..");
      try {
        const snapshot = snapshotFixture(ctx.root);
        const result = runPdt(cwd, ["release", "--release", "REL-0001", "--yes"]);
        expect(result.status, result.combined).toBe(0);

        const currRelease = snapshotFixture(ctx.root).get(
          "06-releases/0001-rel-proposed-scaffold.md",
        )!;
        const snapRelease = snapshot.get("06-releases/0001-rel-proposed-scaffold.md")!;
        expect(currRelease, `run ${i}: release body must change`).not.toBe(snapRelease);
        expect(currRelease, `run ${i}: must have deployment checklist`).toMatch(
          /^## Deployment Checklist/m,
        );

        passCount++;
      } finally {
        ctx.cleanup();
      }
    }
    expect(passCount, "all 5 runs must pass").toBe(5);
  });
});
