import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createDeliverFixture } from "../helpers/deliver-fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const petJs = path.join(repoRoot, "dist", "pet.js");

function orchestrationBulletCount(orchPath: string): number {
  if (!fs.existsSync(orchPath)) return 0;
  const raw = fs.readFileSync(orchPath, "utf8");
  let n = 0;
  for (const line of raw.split("\n")) {
    if (/^- [0-9]{4}-/.test(line)) {
      n++;
    }
  }
  return n;
}

function runPdt(cwd: string, args: string[]): { status: number | null; combined: string } {
  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PET_MOCK_AGENTS: "1" },
  });
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { status: r.status, combined };
}

describe("FEAT-0021 mock deliver (isolated fixture)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("dry-run, mock deliver, validate, then idempotent dry-run (no live API)", () => {
    const ctx = createDeliverFixture();
    try {
      // FEAT-0021: accepted, architecturally cleared, no tasks yet — TechLead should be spawned.
      fs.writeFileSync(
        path.join(ctx.productRoot, "03-features/0021-mock-deliver.md"),
        [
          "---",
          "id: FEAT-0021",
          "status: accepted",
          "solution_hypothesis_id: SOL-0001",
          "architectural_review_status: cleared",
          "---",
          "",
          "# Mock Deliver",
          "",
        ].join("\n"),
        "utf8",
      );

      const orch = path.join(ctx.productRoot, "orchestration/decisions.md");
      const beforeOrch = orchestrationBulletCount(orch);

      const dry1 = runPdt(ctx.repoRoot, ["deliver", "--feature", "FEAT-0021", "--dry-run"]);
      expect(dry1.status).toBe(0);
      expect(dry1.combined).toContain("spawn TechLead for FEAT-0021");
      expect(dry1.combined).toContain("(dry-run: no agents executed)");
      expect(dry1.combined).not.toContain("spawn Architect for FEAT-0021");
      expect(orchestrationBulletCount(orch)).toBe(beforeOrch);

      const deliver = runPdt(ctx.repoRoot, ["deliver", "--feature", "FEAT-0021", "--yes"]);
      expect(deliver.status, deliver.combined).toBe(0);

      const afterOrch = orchestrationBulletCount(orch);
      expect(afterOrch).toBe(beforeOrch + 1);

      const validate = runPdt(ctx.repoRoot, ["validate"]);
      expect(validate.status, validate.combined).toBe(0);

      const tasksDir = path.join(ctx.productRoot, "04-tasks");
      const taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
      const forFeat21 = taskFiles.filter((f) => {
        const raw = fs.readFileSync(path.join(tasksDir, f), "utf8");
        return /^feature_id:\s*FEAT-0021$/m.test(raw);
      });
      expect(forFeat21.length).toBeGreaterThan(0);

      const dry2 = runPdt(ctx.repoRoot, ["deliver", "--feature", "FEAT-0021", "--dry-run"]);
      expect(dry2.status).toBe(0);
      expect(dry2.combined).toContain("already has open task");
      expect(dry2.combined).not.toContain("spawn TechLead for FEAT-0021");
      expect(orchestrationBulletCount(orch)).toBe(afterOrch);
    } finally {
      ctx.cleanup();
    }
  });
});
