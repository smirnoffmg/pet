import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDevFixture } from "../helpers/dev-fixture.js";
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

describe("FEAT-0015 Dev correctness (mock mode)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("T1: happy-path — todo task with scaffold body gets enriched", () => {
    const ctx = createDevFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["develop", "--task", "TASK-0001", "--yes"]);
      expect(result.status, result.combined).toBe(0);

      const current = snapshotFixture(ctx.root);

      // Task body must have changed
      const snapTask = snapshot.get("04-tasks/0001-task-scaffold.md")!;
      const currTask = current.get("04-tasks/0001-task-scaffold.md")!;
      expect(currTask, "task body must be enriched").not.toBe(snapTask);

      // Frontmatter must be identical (Dev must not change status/feature_id)
      expect(currTask, "task must still have TASK-0001").toMatch(/id: TASK-0001/);
      expect(currTask, "task must still have status: todo").toMatch(/status: todo/);
      expect(currTask, "task must still have feature_id: FEAT-0001").toMatch(
        /feature_id: FEAT-0001/,
      );

      // No other files changed (excluding orchestration log)
      for (const [rel, content] of snapshot) {
        if (rel === "orchestration/decisions.md") continue;
        if (rel === "04-tasks/0001-task-scaffold.md") continue;
        const curr = current.get(rel);
        expect(curr, `side-effect: ${rel} must not change`).toBe(content);
      }

      // No new files created (excluding orchestration log which may be created)
      for (const rel of current.keys()) {
        if (rel === "orchestration/decisions.md") continue;
        if (rel === "04-tasks/0001-task-scaffold.md") continue;
        expect(
          snapshot.has(rel) || rel.startsWith("orchestration/"),
          `new file created: ${rel}`,
        ).toBe(true);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T2: gate-abort — done task leaves zero files changed", () => {
    const ctx = createDevFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["develop", "--task", "TASK-0002", "--yes"]);

      // Done task must be rejected with non-zero exit
      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T3: gate-abort — nonexistent task exits non-zero with no file changes", () => {
    const ctx = createDevFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["develop", "--task", "TASK-9999", "--yes"]);

      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T4: idempotent — enriched task can be re-enriched without errors", () => {
    const ctx = createDevFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      // First enrichment
      const result1 = runPdt(cwd, ["develop", "--task", "TASK-0001", "--yes"]);
      expect(result1.status, result1.combined).toBe(0);

      // Snapshot after first run
      const snapshot2 = snapshotFixture(ctx.root);

      // Second enrichment — must not fail and may overwrite
      const result2 = runPdt(cwd, ["develop", "--task", "TASK-0001", "--yes"]);
      expect(result2.status, result2.combined).toBe(0);

      // Still only the task file may change; all other files are stable
      const current = snapshotFixture(ctx.root);
      for (const [rel, content] of snapshot2) {
        if (rel === "orchestration/decisions.md") continue;
        if (rel === "04-tasks/0001-task-scaffold.md") continue;
        const curr = current.get(rel);
        expect(curr, `side-effect on second run: ${rel}`).toBe(content);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T5: volume run — five fixture invocations all enrich the task", () => {
    let passCount = 0;
    for (let i = 0; i < 5; i++) {
      const ctx = createDevFixture();
      const cwd = path.resolve(ctx.root, "..", "..");
      try {
        const snapshot = snapshotFixture(ctx.root);
        const result = runPdt(cwd, ["develop", "--task", "TASK-0001", "--yes"]);
        expect(result.status, result.combined).toBe(0);

        const currTask = snapshotFixture(ctx.root).get("04-tasks/0001-task-scaffold.md")!;
        const snapTask = snapshot.get("04-tasks/0001-task-scaffold.md")!;
        expect(currTask, `run ${i}: task body must change`).not.toBe(snapTask);

        passCount++;
      } finally {
        ctx.cleanup();
      }
    }
    expect(passCount, "all 5 runs must pass").toBe(5);
  });
});
