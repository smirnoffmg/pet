import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createQaFixture } from "../helpers/qa-fixture.js";
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

describe("FEAT-0016 QA correctness (mock mode)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("T1: happy-path — accepted feature with done tasks gets a QA plan artifact", () => {
    const ctx = createQaFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["qa", "--feature", "FEAT-0001", "--yes"]);
      expect(result.status, result.combined).toBe(0);

      const current = snapshotFixture(ctx.root);

      // Exactly one new QA plan file must appear under qa_plans/
      const newFiles = [...current.keys()].filter(
        (rel) => !snapshot.has(rel) && rel !== "orchestration/decisions.md",
      );
      expect(
        newFiles.length,
        `expected exactly 1 new QA plan file, got: ${newFiles.join(", ")}`,
      ).toBe(1);
      const qaPlanPath = newFiles[0]!;
      expect(qaPlanPath, "new file must be in 05-qa-plans/").toMatch(/^05-qa-plans\//);

      // QA plan must have valid frontmatter
      const qaPlanContent = current.get(qaPlanPath)!;
      expect(qaPlanContent, "QA plan must have QA- id").toMatch(/id: QA-\d{4}/);
      expect(qaPlanContent, "QA plan must be proposed").toMatch(/status: proposed/);
      expect(qaPlanContent, "QA plan must reference FEAT-0001").toMatch(/feature_id: FEAT-0001/);

      // No existing files changed (excluding orchestration log)
      for (const [rel, content] of snapshot) {
        if (rel === "orchestration/decisions.md") continue;
        const curr = current.get(rel);
        expect(curr, `side-effect: ${rel} must not change`).toBe(content);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T2: gate-abort — proposed feature exits non-zero with no file changes", () => {
    const ctx = createQaFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["qa", "--feature", "FEAT-0002", "--yes"]);

      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T3: gate-abort — accepted feature with no done tasks exits non-zero", () => {
    const ctx = createQaFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["qa", "--feature", "FEAT-0003", "--yes"]);

      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T4: idempotent — second QA run on same feature returns idle (plan already exists)", () => {
    const ctx = createQaFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      // First run — creates QA plan
      const result1 = runPdt(cwd, ["qa", "--feature", "FEAT-0001", "--yes"]);
      expect(result1.status, result1.combined).toBe(0);

      const snapshot2 = snapshotFixture(ctx.root);

      // Second run — must not create a duplicate QA plan
      const result2 = runPdt(cwd, ["qa", "--feature", "FEAT-0001", "--yes"]);
      expect(result2.status, result2.combined).toBe(0);

      const current = snapshotFixture(ctx.root);
      const qaPlans = [...current.keys()].filter(
        (r) => r.startsWith("05-qa-plans/") && r.endsWith(".md"),
      );
      expect(qaPlans.length, "exactly one QA plan must exist after two runs").toBe(1);

      // No new files besides the existing QA plan (and orchestration log)
      for (const [rel, content] of snapshot2) {
        if (rel === "orchestration/decisions.md") continue;
        const curr = current.get(rel);
        expect(curr, `side-effect on second run: ${rel}`).toBe(content);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T5: volume run — five fixture invocations all create exactly one QA plan", () => {
    let passCount = 0;
    for (let i = 0; i < 5; i++) {
      const ctx = createQaFixture();
      const cwd = path.resolve(ctx.root, "..", "..");
      try {
        const snapshot = snapshotFixture(ctx.root);
        const result = runPdt(cwd, ["qa", "--feature", "FEAT-0001", "--yes"]);
        expect(result.status, result.combined).toBe(0);

        const current = snapshotFixture(ctx.root);
        const newQaFiles = [...current.keys()].filter(
          (rel) => !snapshot.has(rel) && rel.startsWith("05-qa-plans/"),
        );
        expect(newQaFiles.length, `run ${i}: must create exactly 1 QA plan`).toBe(1);

        passCount++;
      } finally {
        ctx.cleanup();
      }
    }
    expect(passCount, "all 5 runs must pass").toBe(5);
  });
});
