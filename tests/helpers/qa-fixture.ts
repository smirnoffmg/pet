import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface QaFixtureContext {
  /** Absolute path to the doc/product directory inside the temp dir. */
  root: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a fresh QA correctness fixture in a temp directory.
 *
 * Layout (relative to ctx.root = <tmp>/doc/product):
 *   features/0001-feat-accepted-with-done-tasks.md — accepted feature (T1 target)
 *   features/0002-feat-proposed.md                 — proposed feature (T2 gate: not yet accepted)
 *   features/0003-feat-accepted-no-done-tasks.md   — accepted feature, no done tasks (T3 gate)
 *   tasks/0001-task-done.md                        — done task linked to FEAT-0001
 *   tasks/0002-task-todo.md                        — todo task linked to FEAT-0003
 *   metrics/0001-sentinel.md                       — side-effect detection
 *   qa_plans/                                      — empty (side-effect detection)
 *   orchestration/decisions.md                     — append-only log
 *
 * CLI cwd must be path.resolve(ctx.root, '..', '..') so findRepoRoot() works.
 */
export function createQaFixture(): QaFixtureContext {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-qa-fixture-"));
  const root = path.join(tmp, "doc", "product");

  for (const dir of [
    "03-features",
    "04-tasks",
    "01-metrics",
    "05-qa-plans",
    "orchestration",
    "00-problem-hypotheses",
    "02-solution-hypotheses",
    "06-releases",
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // Ancestry chain: MET-0001 → PROB-0001 → SOL-0001 → FEAT-*
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

  // T1 target: accepted feature with a done task
  fs.writeFileSync(
    path.join(root, "03-features", "0001-feat-accepted-with-done-tasks.md"),
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
      "Users need to export their data to CSV.",
      "",
      "## Decision",
      "",
      "Add an export endpoint and a download button.",
      "",
      "## Acceptance criteria",
      "",
      "- Export returns valid CSV",
      "- Download completes within 5 seconds",
      "",
      "## Consequences",
      "",
      "Increased load on the database.",
    ].join("\n"),
    "utf8",
  );

  // T2 gate: proposed feature — QA requires accepted status
  fs.writeFileSync(
    path.join(root, "03-features", "0002-feat-proposed.md"),
    [
      "---",
      "id: FEAT-0002",
      "status: proposed",
      "solution_hypothesis_id: SOL-0001",
      "---",
      "",
      "# Feature: dark mode",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Acceptance criteria",
      "",
      "## Consequences",
    ].join("\n"),
    "utf8",
  );

  // T3 gate: accepted feature but no done tasks yet — QA can't run without done tasks
  fs.writeFileSync(
    path.join(root, "03-features", "0003-feat-accepted-no-done-tasks.md"),
    [
      "---",
      "id: FEAT-0003",
      "status: accepted",
      "solution_hypothesis_id: SOL-0001",
      "architectural_review_status: cleared",
      "---",
      "",
      "# Feature: search",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Acceptance criteria",
      "",
      "## Consequences",
    ].join("\n"),
    "utf8",
  );

  // Done task linked to FEAT-0001 (enables T1)
  fs.writeFileSync(
    path.join(root, "04-tasks", "0001-task-done.md"),
    [
      "---",
      "id: TASK-0001",
      "status: done",
      "feature_id: FEAT-0001",
      "---",
      "",
      "# Implement export endpoint",
      "",
      "## Description",
      "",
      "Implemented and merged.",
    ].join("\n"),
    "utf8",
  );

  // Todo task linked to FEAT-0003 (T3: no done tasks for that feature)
  fs.writeFileSync(
    path.join(root, "04-tasks", "0002-task-todo.md"),
    [
      "---",
      "id: TASK-0002",
      "status: todo",
      "feature_id: FEAT-0003",
      "---",
      "",
      "# Implement search index",
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
