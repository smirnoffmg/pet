import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createResearcherFixture, createVariantFixture } from "../helpers/researcher-fixture.js";
import { snapshotFixture, assertNoChange, assertFixtureDiff } from "../helpers/fixture-diff.js";

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

describe("FEAT-0013 Researcher correctness (mock mode)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("T1: happy-path — proposed hypothesis with empty Evidence gets populated", () => {
    const ctx = createResearcherFixture();
    // cwd must be the repo root (two levels above doc/product) so findRepoRoot() works
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["discover", "--hypothesis", "PROB-0001", "--yes"]);
      expect(result.status, result.combined).toBe(0);

      assertFixtureDiff({
        snapshot,
        root: ctx.root,
        targetHypothesisPath: "00-problem-hypotheses/0001-hyp-proposed.md",
        expectEvidenceChanged: true,
        // orchestration/decisions.md is written by CLI infrastructure, not the Researcher subagent
        excludedPaths: ["orchestration/decisions.md"],
      });

      // T1 additional: ## Context, ## Decision, ## Consequences must be byte-identical to snapshot
      const snapTarget = snapshot.get("00-problem-hypotheses/0001-hyp-proposed.md")!;
      const currTarget = fs.readFileSync(
        path.join(ctx.root, "00-problem-hypotheses", "0001-hyp-proposed.md"),
        "utf8",
      );
      for (const section of ["## Context", "## Decision", "## Consequences"]) {
        const snapSection = extractSection(snapTarget, section);
        const currSection = extractSection(currTarget, section);
        expect(currSection, `scope-creep guard: ${section} must be unchanged`).toBe(snapSection);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("T2: gate-abort — accepted hypothesis leaves zero files changed", () => {
    const ctx = createResearcherFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["discover", "--hypothesis", "PROB-0003", "--yes"]);

      // The reconciler returns ok:false for accepted hypotheses targeting the accepted-idle path
      // (accepted + active SOL-), or exits 1 with a reason message. Either way no files change.
      // Accept non-zero exit OR a message indicating no action was taken.
      const declined =
        result.status !== 0 || /idle|no.*action|nothing|already has/i.test(result.combined);
      expect(declined, `Expected gate-abort but got: ${result.combined}`).toBe(true);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T3: gate-abort — invalidated hypothesis leaves zero files changed", () => {
    const ctx = createResearcherFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["discover", "--hypothesis", "PROB-0004", "--yes"]);

      // reconcileDiscovery returns ok:false for invalidated status → exit 1
      expect(result.status, `Expected non-zero exit. Output: ${result.combined}`).not.toBe(0);

      assertNoChange(snapshot, ctx.root);
    } finally {
      ctx.cleanup();
    }
  });

  it("T4: proposed hypothesis with existing Evidence — agent augments, does not delete content", () => {
    const ctx = createResearcherFixture();
    const cwd = path.resolve(ctx.root, "..", "..");
    try {
      const snapshot = snapshotFixture(ctx.root);
      const result = runPdt(cwd, ["discover", "--hypothesis", "PROB-0002", "--yes"]);
      expect(result.status, result.combined).toBe(0);

      assertFixtureDiff({
        snapshot,
        root: ctx.root,
        targetHypothesisPath: "00-problem-hypotheses/0002-hyp-proposed-with-evidence.md",
        expectEvidenceChanged: true,
        excludedPaths: ["orchestration/decisions.md"],
      });

      // T4 additional: ## Evidence heading must still exist and body must be non-empty
      const curr = fs.readFileSync(
        path.join(ctx.root, "00-problem-hypotheses", "0002-hyp-proposed-with-evidence.md"),
        "utf8",
      );
      expect(curr, "## Evidence heading must be present").toMatch(/^## Evidence/m);
      const evidenceBody = extractSectionBody(curr, "## Evidence");
      expect(
        evidenceBody.trim().length,
        "## Evidence body must not be empty (agent must not have deleted content)",
      ).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
  });

  it("T5: volume run — five fixture variants all populate Evidence correctly", () => {
    let passCount = 0;
    for (const variantIndex of [0, 1, 2, 3, 4]) {
      const ctx = createVariantFixture(variantIndex);
      const cwd = path.resolve(ctx.root, "..", "..");
      try {
        const snapshot = snapshotFixture(ctx.root);
        const result = runPdt(cwd, ["discover", "--hypothesis", "PROB-0001", "--yes"]);
        expect(result.status, result.combined).toBe(0);

        assertFixtureDiff({
          snapshot,
          root: ctx.root,
          targetHypothesisPath: "00-problem-hypotheses/0001-hyp-proposed.md",
          expectEvidenceChanged: true,
          excludedPaths: ["orchestration/decisions.md"],
        });

        passCount++;
      } finally {
        ctx.cleanup();
      }
    }
    expect(passCount, "all 5 variants must pass").toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the full section text (heading + body) for a given heading. */
function extractSection(content: string, heading: string): string {
  const parts = content.split(/\n(?=## )/);
  for (const part of parts) {
    if (part.trimStart().startsWith(heading)) return part;
  }
  return "";
}

/** Returns only the body (everything after the heading line) of a section. */
function extractSectionBody(content: string, heading: string): string {
  const section = extractSection(content, heading);
  const idx = section.indexOf("\n");
  return idx === -1 ? "" : section.slice(idx + 1);
}
