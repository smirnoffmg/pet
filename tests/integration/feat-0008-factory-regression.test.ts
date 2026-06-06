import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDiscoveryFixture } from "../helpers/discovery-fixture.js";
import { createDeliverFixture } from "../helpers/deliver-fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const petJs = path.join(repoRoot, "dist", "pet.js");

function runPdt(cwd: string, args: string[]): { status: number | null; combined: string } {
  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PET_MOCK_AGENTS: "1",
      PET_LLM_PROVIDER: "anthropic",
    },
  });
  return { status: r.status, combined: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("FEAT-0008 factory regression (mock mode)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("mock discover cycle completes under PET_LLM_PROVIDER=anthropic without a real API key", () => {
    const ctx = createDiscoveryFixture();
    try {
      const run = runPdt(ctx.repoRoot, ["discover", "--hypothesis", "PROB-0001", "--yes"]);
      expect(run.status, run.combined).toBe(0);

      const hypPath = path.join(
        ctx.productRoot,
        "00-problem-hypotheses/0001-users-have-problem-x.md",
      );
      const raw = fs.readFileSync(hypPath, "utf8");
      expect(raw).toMatch(/## Evidence\s*\n\s*\S/);
    } finally {
      ctx.cleanup();
    }
  });

  it("mock deliver cycle completes under PET_LLM_PROVIDER=anthropic without a real API key", () => {
    // FEAT-0012 has architectural_review_status: pending — Architect mock will clear it.
    const ctx = createDeliverFixture();
    try {
      fs.writeFileSync(
        path.join(ctx.productRoot, "03-features/0012-test-solution-feature.md"),
        [
          "---",
          "id: FEAT-0012",
          "status: accepted",
          "solution_hypothesis_id: SOL-0001",
          "architectural_review_status: pending",
          "---",
          "",
          "# Test Solution Feature",
          "",
        ].join("\n"),
        "utf8",
      );

      const run = runPdt(ctx.repoRoot, ["deliver", "--feature", "FEAT-0012", "--yes"]);
      expect(run.status, run.combined).toBe(0);

      const featPath = path.join(ctx.productRoot, "03-features/0012-test-solution-feature.md");
      const raw = fs.readFileSync(featPath, "utf8");
      expect(raw).toMatch(/^architectural_review_status:\s*cleared/m);
    } finally {
      ctx.cleanup();
    }
  });
});
