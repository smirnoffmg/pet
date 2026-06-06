import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDiscoveryFixture } from "../helpers/discovery-fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const petJs = path.join(repoRoot, "dist", "pet.js");

function runPdt(cwd: string, args: string[]): { status: number | null; combined: string } {
  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PET_MOCK_AGENTS: "1" },
  });
  return { status: r.status, combined: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function fileCount(dir: string, ext = ".md"): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
}

describe("FEAT-0005 mock discover (isolated fixture)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("full discovery chain: PROB- → Researcher → accept → SolutionDesigner → accept → FeatureDesigner (no live API)", () => {
    const ctx = createDiscoveryFixture();
    const tmp = ctx.repoRoot;
    try {
      const solDir = path.join(ctx.productRoot, "02-solution-hypotheses");
      const featDir = path.join(ctx.productRoot, "03-features");

      // --- Step 1: PROB-0001 proposed + empty evidence → Researcher ---
      const dry1 = runPdt(tmp, ["discover", "--hypothesis", "PROB-0001", "--dry-run"]);
      expect(dry1.status, dry1.combined).toBe(0);
      expect(dry1.combined).toContain("spawn Researcher for PROB-0001");
      expect(dry1.combined).toContain("(dry-run: no agents executed)");

      const run1 = runPdt(tmp, ["discover", "--hypothesis", "PROB-0001", "--yes"]);
      expect(run1.status, run1.combined).toBe(0);

      const hypPath = path.join(
        ctx.productRoot,
        "00-problem-hypotheses/0001-users-have-problem-x.md",
      );
      const hypRaw = fs.readFileSync(hypPath, "utf8");
      expect(hypRaw).toMatch(/## Evidence\s*\n\s*\S/);

      // --- Step 2: HITL — accept the hypothesis ---
      const accept1 = runPdt(tmp, ["accept", "hypothesis", "PROB-0001", "--yes"]);
      expect(accept1.status, accept1.combined).toBe(0);
      expect(accept1.combined).toContain("Accepted PROB-0001");

      const hypRawAfter = fs.readFileSync(hypPath, "utf8");
      expect(hypRawAfter).toMatch(/^status:\s*accepted/m);

      // --- Step 3: PROB-0001 accepted, no SOL- → SolutionDesigner ---
      const dry2 = runPdt(tmp, ["discover", "--hypothesis", "PROB-0001", "--dry-run"]);
      expect(dry2.status, dry2.combined).toBe(0);
      expect(dry2.combined).toContain("spawn SolutionDesigner for PROB-0001");

      const run2 = runPdt(tmp, ["discover", "--hypothesis", "PROB-0001", "--yes"]);
      expect(run2.status, run2.combined).toBe(0);
      expect(fileCount(solDir)).toBeGreaterThan(0);

      // --- Step 4: HITL — accept the solution hypothesis ---
      const solId = ((): string => {
        for (const f of fs.readdirSync(solDir).filter((x) => x.endsWith(".md"))) {
          const raw = fs.readFileSync(path.join(solDir, f), "utf8");
          const m = /^id:\s*(SOL-\d+)/m.exec(raw);
          if (m?.[1]) return m[1];
        }
        throw new Error("No SOL- artifact found after SolutionDesigner ran");
      })();

      const accept2 = runPdt(tmp, ["accept", "solution-hypothesis", solId, "--yes"]);
      expect(accept2.status, accept2.combined).toBe(0);
      expect(accept2.combined).toContain(`Accepted ${solId}`);

      // --- Step 5: SOL- accepted, no FEAT- → FeatureDesigner ---
      const dry3 = runPdt(tmp, ["discover", "--solution-hypothesis", solId, "--dry-run"]);
      expect(dry3.status, dry3.combined).toBe(0);
      expect(dry3.combined).toContain("spawn FeatureDesigner for");

      const run3 = runPdt(tmp, ["discover", "--solution-hypothesis", solId, "--yes"]);
      expect(run3.status, run3.combined).toBe(0);
      expect(fileCount(featDir)).toBeGreaterThan(0);

      // --- Step 6: Idempotency — second discover on SOL- emits no commands ---
      const dry4 = runPdt(tmp, ["discover", "--solution-hypothesis", solId, "--dry-run"]);
      expect(dry4.status, dry4.combined).toBe(0);
      expect(dry4.combined).not.toContain("spawn FeatureDesigner");

      // --- Step 7: Validate the whole fixture tree ---
      const validate = runPdt(tmp, ["validate"]);
      expect(validate.status, validate.combined).toBe(0);
    } finally {
      ctx.cleanup();
    }
  });
});
