import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDiscoveryFixture, teardownDiscoveryFixture } from "./discovery-fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const petJs = path.join(repoRoot, "dist", "pet.js");

describe("createDiscoveryFixture smoke test", () => {
  it("creates the expected files and directories", () => {
    const ctx = createDiscoveryFixture();
    try {
      const expectedDirs = [
        "01-metrics",
        "00-problem-hypotheses",
        "02-solution-hypotheses",
        "03-features",
        "04-tasks",
        "06-releases",
        "orchestration",
      ];
      for (const dir of expectedDirs) {
        expect(
          fs.existsSync(path.join(ctx.productRoot, dir)),
          `expected directory missing: ${dir}`,
        ).toBe(true);
      }

      const expectedFiles = [
        "01-metrics/0001-discovery-metric.md",
        "00-problem-hypotheses/0001-users-have-problem-x.md",
        "orchestration/decisions.md",
      ];
      for (const rel of expectedFiles) {
        expect(
          fs.existsSync(path.join(ctx.productRoot, rel)),
          `expected file missing: ${rel}`,
        ).toBe(true);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("PROB-0001 is proposed with a structurally empty Evidence section", () => {
    const ctx = createDiscoveryFixture();
    try {
      const hypRaw = fs.readFileSync(
        path.join(ctx.productRoot, "00-problem-hypotheses", "0001-users-have-problem-x.md"),
        "utf8",
      );
      expect(hypRaw).toMatch(/^id:\s*PROB-0001/m);
      expect(hypRaw).toMatch(/^status:\s*proposed/m);

      // Evidence section must exist and have no body content before the next ## heading
      const evidenceMatch = /## Evidence[ \t]*\n([\s\S]*?)(?=\n## |$)/i.exec(hypRaw);
      expect(evidenceMatch).not.toBeNull();
      expect(evidenceMatch![1]!.trim()).toBe("");
    } finally {
      ctx.cleanup();
    }
  });

  it("cleanup() removes the temp directory", () => {
    const ctx = createDiscoveryFixture();
    expect(fs.existsSync(ctx.repoRoot)).toBe(true);
    ctx.cleanup();
    expect(fs.existsSync(ctx.repoRoot)).toBe(false);
  });

  it("teardownDiscoveryFixture is a no-arg convenience wrapper", () => {
    const ctx = createDiscoveryFixture();
    expect(fs.existsSync(ctx.repoRoot)).toBe(true);
    teardownDiscoveryFixture(ctx);
    expect(fs.existsSync(ctx.repoRoot)).toBe(false);
  });

  it("the freshly created fixture validates cleanly via `pet validate`", () => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
    const ctx = createDiscoveryFixture();
    try {
      const r = spawnSync(process.execPath, [petJs, "validate"], {
        cwd: ctx.repoRoot,
        encoding: "utf8",
      });
      const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      expect(r.status, combined).toBe(0);
    } finally {
      ctx.cleanup();
    }
  });
});
