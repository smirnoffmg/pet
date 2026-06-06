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

describe("FEAT-0013 idempotency contract (ADR-0008 §2)", () => {
  beforeAll(() => {
    if (!fs.existsSync(petJs)) {
      throw new Error(`Missing ${petJs} — run 'npm run build' before tests`);
    }
  });

  it("dry-run on a cleared feature that already has tasks emits zero spawn commands", () => {
    const ctx = createDeliverFixture();
    try {
      // FEAT-0013: accepted, cleared, already has an open task — DeliveryLead should be idle.
      fs.writeFileSync(
        path.join(ctx.productRoot, "03-features/0013-researcher-correctness.md"),
        [
          "---",
          "id: FEAT-0013",
          "status: accepted",
          "solution_hypothesis_id: SOL-0001",
          "architectural_review_status: cleared",
          "---",
          "",
          "# Researcher Correctness",
          "",
        ].join("\n"),
        "utf8",
      );

      fs.writeFileSync(
        path.join(ctx.productRoot, "04-tasks/0001-implement-researcher-correctness.md"),
        [
          "---",
          "id: TASK-0001",
          "status: todo",
          "feature_id: FEAT-0013",
          "---",
          "",
          "# Implement Researcher Correctness",
          "",
        ].join("\n"),
        "utf8",
      );

      const orch = path.join(ctx.productRoot, "orchestration/decisions.md");
      const beforeOrch = orchestrationBulletCount(orch);

      const dry = runPdt(ctx.repoRoot, ["deliver", "--feature", "FEAT-0013", "--dry-run"]);
      expect(dry.status).toBe(0);
      // The exact idle reason depends on whether tasks are open or done,
      // but the idempotency contract (ADR-0008 §2) is: no spawn commands either way.
      expect(dry.combined).toMatch(/already has open task|no open tasks|Nothing for DeliveryLead/);
      expect(dry.combined).not.toContain("spawn Architect for FEAT-0013");
      expect(dry.combined).not.toContain("spawn TechLead for FEAT-0013");
      expect(orchestrationBulletCount(orch)).toBe(beforeOrch);
    } finally {
      ctx.cleanup();
    }
  });
});
