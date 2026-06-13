import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DeliverFixtureContext {
  /** Absolute path to the temp repo root. Pass as `cwd` to `spawnSync(pet, ...)`. */
  repoRoot: string;
  /** Absolute path to `<repoRoot>/doc/product`. */
  productRoot: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a minimal, self-consistent delivery fixture in a fresh temp directory.
 *
 * Provides the base FK chain (MET-0001 → PROB-0001 → SOL-0001) and all artifact
 * directories. Tests add their specific feature/task files on top.
 *
 * Layout (relative to productRoot = <tmp>/doc/product):
 *   01-metrics/0001-m.md                — MET-0001, accepted
 *   00-problem-hypotheses/0001-prob.md  — PROB-0001, proposed, targets MET-0001
 *   02-solution-hypotheses/0001-sol.md  — SOL-0001, accepted, bridges PROB-0001/MET-0001
 *   03-features/                        — empty; tests write feature files here
 *   04-tasks/                           — empty; tests or mock agents write task files here
 *   orchestration/decisions.md          — initialized audit log
 */
export function createDeliverFixture(): DeliverFixtureContext {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pet-deliver-fixture-"));
  const docRoot = path.join(repoRoot, "doc");
  const productRoot = path.join(docRoot, "product");

  for (const dir of [
    "01-metrics",
    "00-problem-hypotheses",
    "02-solution-hypotheses",
    "03-features",
    "04-tasks",
    "06-releases",
    "orchestration",
  ]) {
    fs.mkdirSync(path.join(productRoot, dir), { recursive: true });
  }

  fs.writeFileSync(
    path.join(productRoot, "00-problem-hypotheses/0001-prob.md"),
    ["---", "id: PROB-0001", "status: proposed", "---", "", "# Problem", ""].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "01-metrics/0001-m.md"),
    [
      "---",
      "id: MET-0001",
      "status: accepted",
      "problem_hypothesis_id: PROB-0001",
      "---",
      "",
      "# Metric",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "02-solution-hypotheses/0001-sol.md"),
    [
      "---",
      "id: SOL-0001",
      "status: accepted",
      "metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Solution",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "orchestration/decisions.md"),
    "# Orchestration decisions log\n\nAppend-only audit trail for controller decisions.\n",
    "utf8",
  );

  return {
    repoRoot,
    productRoot,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  };
}
