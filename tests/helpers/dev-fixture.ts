import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface DevFixtureContext {
  /** Absolute path to the doc/product directory inside the temp dir. */
  root: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a fresh Dev correctness fixture in a temp directory.
 *
 * Layout (relative to ctx.root = <tmp>/doc/product):
 *   features/0001-feat-accepted.md          — linked feature (accepted, with acceptance criteria)
 *   tasks/0001-task-scaffold.md             — todo task, minimal body (T1 target)
 *   tasks/0002-task-done.md                 — done task (T2 gate target)
 *   metrics/0001-sentinel.md                — side-effect detection
 *   orchestration/decisions.md              — append-only log
 *
 * CLI cwd must be path.resolve(ctx.root, '..', '..') so findRepoRoot() works.
 */
export function createDevFixture(): DevFixtureContext {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-dev-fixture-"));
  const root = path.join(tmp, "doc", "product");

  for (const dir of [
    "03-features",
    "04-tasks",
    "01-metrics",
    "orchestration",
    "05-qa-plans",
    "00-problem-hypotheses",
    "02-solution-hypotheses",
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // Ancestry chain required by feature FK: MET-0001 → PROB-0001 → SOL-0001 → FEAT-0001
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

  // Accepted feature with acceptance criteria — linked by both tasks
  fs.writeFileSync(
    path.join(root, "03-features", "0001-feat-accepted.md"),
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
      "Users need to export their data to CSV for offline analysis.",
      "",
      "## Decision",
      "",
      "Add an export endpoint to the API and a download button in the UI.",
      "",
      "## Acceptance criteria",
      "",
      "- Export returns valid CSV with all user records",
      "- Download completes within 5 seconds for up to 10,000 rows",
      "- Empty datasets return a CSV with headers only",
      "",
      "## Consequences",
      "",
      "Increased load on the database during export operations.",
    ].join("\n"),
    "utf8",
  );

  // T1 target: todo task with minimal/scaffold body
  fs.writeFileSync(
    path.join(root, "04-tasks", "0001-task-scaffold.md"),
    [
      "---",
      "id: TASK-0001",
      "status: todo",
      "feature_id: FEAT-0001",
      "---",
      "",
      "# Implement export endpoint",
      "",
      "## Description",
      "",
      "## Notes",
      "",
    ].join("\n"),
    "utf8",
  );

  // T2 gate target: done task — Dev should decline to enrich it
  fs.writeFileSync(
    path.join(root, "04-tasks", "0002-task-done.md"),
    [
      "---",
      "id: TASK-0002",
      "status: done",
      "feature_id: FEAT-0001",
      "---",
      "",
      "# Add download button",
      "",
      "## Description",
      "",
      "Completed.",
      "",
      "## Notes",
      "",
      "Merged in PR #42.",
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
