import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DevOpsFixtureContext {
  /** Absolute path to the doc/product directory inside the temp dir. */
  root: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a fresh DevOps correctness fixture in a temp directory.
 *
 * Layout (relative to ctx.root = <tmp>/doc/product):
 *   features/0001-feat-released.md           — released feature linked by releases
 *   releases/0001-rel-proposed-scaffold.md   — proposed release, no deployment checklist (T1 target)
 *   releases/0002-rel-accepted.md            — accepted release (T2 gate: already accepted)
 *   metrics/0001-sentinel.md                 — side-effect detection
 *   orchestration/decisions.md               — append-only log
 *
 * CLI cwd must be path.resolve(ctx.root, '..', '..') so findRepoRoot() works.
 */
export function createDevOpsFixture(): DevOpsFixtureContext {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-devops-fixture-"));
  const root = path.join(tmp, "doc", "product");

  for (const dir of [
    "03-features",
    "06-releases",
    "04-tasks",
    "01-metrics",
    "05-qa-plans",
    "orchestration",
    "00-problem-hypotheses",
    "02-solution-hypotheses",
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // Ancestry chain: MET-0001 → PROB-0001 → SOL-0001 → FEAT-0001
  fs.writeFileSync(
    path.join(root, "00-problem-hypotheses", "0001-hyp-accepted.md"),
    ["---", "id: PROB-0001", "status: accepted", "---", "", "# Hypothesis"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "02-solution-hypotheses", "0001-sol-accepted.md"),
    [
      "---",
      "id: SOL-0001",
      "status: accepted",
      "metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Solution hypothesis",
    ].join("\n"),
    "utf8",
  );

  // Feature linked by the releases
  fs.writeFileSync(
    path.join(root, "03-features", "0001-feat-released.md"),
    [
      "---",
      "id: FEAT-0001",
      "status: accepted",
      "solution_hypothesis_id: SOL-0001",
      "architectural_review_status: cleared",
      "---",
      "",
      "# Feature: implement data export",
      "",
      "## Context",
      "",
      "Users need to export data.",
      "",
      "## Decision",
      "",
      "Add export endpoint.",
      "",
      "## Acceptance criteria",
      "",
      "- Export returns valid CSV",
      "",
      "## Consequences",
      "",
      "Increased DB load.",
    ].join("\n"),
    "utf8",
  );

  // T1 target: proposed release with no deployment checklist
  fs.writeFileSync(
    path.join(root, "06-releases", "0001-rel-proposed-scaffold.md"),
    [
      "---",
      "id: REL-0001",
      "status: proposed",
      "feature_ids:",
      "  - FEAT-0001",
      "---",
      "",
      "# Release 1.0",
      "",
      "## Context",
      "",
      "First production release including the data export feature.",
      "",
      "## Decision",
      "",
      "Ship REL-0001 with FEAT-0001.",
      "",
      "## Consequences",
      "",
      "Users gain data export capability.",
    ].join("\n"),
    "utf8",
  );

  // T2 gate: accepted release — DevOps only enriches proposed releases
  fs.writeFileSync(
    path.join(root, "06-releases", "0002-rel-accepted.md"),
    [
      "---",
      "id: REL-0002",
      "status: accepted",
      "feature_ids:",
      "  - FEAT-0001",
      "---",
      "",
      "# Release 0.9",
      "",
      "## Context",
      "",
      "Beta release.",
      "",
      "## Decision",
      "",
      "Ship beta.",
      "",
      "## Deployment Checklist",
      "",
      "1. Deploy to staging",
      "2. Deploy to production",
      "",
      "## Rollback Plan",
      "",
      "Revert to previous tag.",
    ].join("\n"),
    "utf8",
  );

  // Sentinel metric
  fs.writeFileSync(
    path.join(root, "01-metrics", "0001-sentinel.md"),
    [
      "---",
      "id: MET-0001",
      "status: proposed",
      "problem_hypothesis_id: PROB-0001",
      "---",
      "",
      "# Sentinel metric",
    ].join("\n"),
    "utf8",
  );

  // Orchestration log
  fs.writeFileSync(
    path.join(root, "orchestration", "decisions.md"),
    "# Orchestration decisions log\n\nAppend-only audit trail.\n",
    "utf8",
  );

  return {
    root,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}
