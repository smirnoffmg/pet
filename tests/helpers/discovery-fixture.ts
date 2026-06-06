import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DiscoveryFixtureContext {
  /** Absolute path to the temp repo root. Pass as `cwd` to `spawnSync(pet, ...)`. */
  repoRoot: string;
  /** Absolute path to `<repoRoot>/doc`. */
  docRoot: string;
  /** Absolute path to `<repoRoot>/doc/product`. */
  productRoot: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a minimal, self-consistent discovery fixture in a fresh temp directory.
 *
 * Layout (relative to ctx.productRoot = <tmp>/doc/product):
 *   metrics/0001-discovery-metric.md           — MET-0001, accepted
 *   hypotheses/0001-users-have-problem-x.md    — PROB-0001, proposed, empty Evidence
 *   solution_hypotheses/                        — empty (placeholder for SolutionDesigner)
 *   features/                                   — empty (placeholder for FeatureDesigner)
 *   tasks/                                      — empty
 *   releases/                                   — empty
 *   orchestration/decisions.md                  — append-only audit log
 *
 * The PROB-0001 hypothesis exercises the TASK-0016 `evidenceIsEmpty` regex fix:
 * the `## Evidence` heading is followed by a blank line and then another `##`
 * heading, with no body content in between.
 *
 * Integration tests should pass `ctx.repoRoot` as the `cwd` of every `spawnSync`
 * call so `findRepoRoot()` locates the temp `doc/` tree.
 */
export function createDiscoveryFixture(): DiscoveryFixtureContext {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pet-discovery-fixture-"));
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
    path.join(productRoot, "01-metrics", "0001-discovery-metric.md"),
    [
      "---",
      "id: MET-0001",
      "status: accepted",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Discovery metric",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Consequences",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "00-problem-hypotheses", "0001-users-have-problem-x.md"),
    [
      "---",
      "id: PROB-0001",
      "status: proposed",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Users have problem X",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Evidence",
      "",
      "## How we measure",
      "",
      "## Consequences",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "orchestration", "decisions.md"),
    "# Orchestration decisions log\n\nAppend-only audit trail for controller decisions (Phase 1+).\n",
    "utf8",
  );

  return {
    repoRoot,
    docRoot,
    productRoot,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  };
}

/** Convenience wrapper — calls `ctx.cleanup()`. */
export function teardownDiscoveryFixture(ctx: DiscoveryFixtureContext): void {
  ctx.cleanup();
}
