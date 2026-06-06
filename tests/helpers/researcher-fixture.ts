import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ResearcherFixtureContext {
  /** Absolute path to the doc/product directory inside the temp dir. */
  root: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a fresh researcher correctness fixture in a temp directory.
 *
 * Layout (relative to ctx.root = <tmp>/doc/product):
 *   hypotheses/0001-hyp-proposed.md            — proposed, empty Evidence  (T1 / T5 target)
 *   hypotheses/0002-hyp-proposed-with-evidence.md — proposed, Evidence populated (T4 target)
 *   hypotheses/0003-hyp-accepted.md             — accepted (T2 gate target)
 *   hypotheses/0004-hyp-invalidated.md          — invalidated (T3 gate target)
 *   solution_hypotheses/0001-sol-for-accepted-hyp.md — SOL linked to PROB-0003 so that
 *       reconcileDiscovery returns idle (no commands) for T2, keeping zero diffs.
 *   features/0001-sentinel.md                   — side-effect detection
 *   tasks/0001-sentinel.md                      — side-effect detection
 *   metrics/0001-sentinel.md                    — side-effect detection
 *   orchestration/decisions.md                  — append-only log required by discover-cmd
 *
 * The CLI cwd for pet invocations must be path.resolve(ctx.root, '..', '..') so that
 * findRepoRoot() locates the doc/ directory and sets docRoot correctly.
 *
 * Note: hypothesis schema has no "rejected" status; "invalidated" is the correct analogue.
 */
export function createResearcherFixture(): ResearcherFixtureContext {
  return buildFixture(makeHypProposedContent());
}

/** Convenience wrapper — calls ctx.cleanup(). */
export function teardownResearcherFixture(ctx: ResearcherFixtureContext): void {
  ctx.cleanup();
}

/**
 * Creates a fixture where the substantive sections of hyp-proposed.md have content
 * unique to the given variantIndex. Used for the T5 volume run (TASK-0048).
 */
export function createVariantFixture(variantIndex: number): ResearcherFixtureContext {
  return buildFixture(makeHypProposedContent(variantIndex));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeHypProposedContent(variantIndex?: number): string {
  const titleSuffix = variantIndex !== undefined ? ` (variant ${variantIndex})` : "";
  const contextExtra =
    variantIndex !== undefined
      ? ` Variant ${variantIndex} study focuses on step ${variantIndex + 1} of the activation flow.`
      : "";
  return [
    "---",
    "id: PROB-0001",
    "status: proposed",
    "target_metric_ids:",
    "  - MET-0001",
    "---",
    "",
    `# Hypothesis: users need faster onboarding${titleSuffix}`,
    "",
    "## Context",
    "",
    `Users currently spend 45 minutes on average during initial setup.${contextExtra}`,
    "Studies show attention drops sharply after 20 minutes.",
    "First-run experience is a major driver of day-7 retention.",
    "",
    "## Decision",
    "",
    "We hypothesize that streamlining the first-run flow reduces setup time below 15 minutes",
    "for 80% of new users. Key interventions: reduce form fields, add progress indicators,",
    "defer optional steps to post-activation.",
    "",
    "## Consequences",
    "",
    "If validated, prioritise onboarding flow redesign in the next sprint.",
    "Success metric: median setup time < 15 min and day-7 retention up ≥ 5 pp.",
    "",
    "## Evidence",
    "",
  ].join("\n");
}

function buildFixture(hypProposedContent: string): ResearcherFixtureContext {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-researcher-fixture-"));
  const root = path.join(tmp, "doc", "product");

  for (const dir of [
    "00-problem-hypotheses",
    "02-solution-hypotheses",
    "03-features",
    "04-tasks",
    "01-metrics",
    "orchestration",
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // 1. Proposed hypothesis with empty Evidence — primary T1/T5 target
  fs.writeFileSync(
    path.join(root, "00-problem-hypotheses", "0001-hyp-proposed.md"),
    hypProposedContent,
    "utf8",
  );

  // 2. Proposed hypothesis with pre-existing Evidence — T4 target
  fs.writeFileSync(
    path.join(root, "00-problem-hypotheses", "0002-hyp-proposed-with-evidence.md"),
    [
      "---",
      "id: PROB-0002",
      "status: proposed",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Hypothesis: tooltips reduce time-to-value",
      "",
      "## Context",
      "",
      "Onboarding tooltips guide users through core workflows at activation.",
      "Historical data shows tooltip cohorts reach first-value event 20% faster.",
      "",
      "## Decision",
      "",
      "We hypothesize that contextual tooltips reduce time-to-value by ≥ 15% for new users.",
      "",
      "## Consequences",
      "",
      "If validated, ship tooltip layer as part of onboarding redesign.",
      "",
      "## Evidence",
      "",
      "Prior study (Q3 2024): tooltip cohort completed onboarding 20% faster.",
      "Sample size n=150 across three markets. P-value 0.03.",
      "",
    ].join("\n"),
    "utf8",
  );

  // 3. Accepted hypothesis — T2 gate target
  //    SOL-0001 below links to this HYP so reconcileDiscovery returns idle (zero diffs).
  fs.writeFileSync(
    path.join(root, "00-problem-hypotheses", "0003-hyp-accepted.md"),
    [
      "---",
      "id: PROB-0003",
      "status: accepted",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Hypothesis: caching improves response time",
    ].join("\n"),
    "utf8",
  );

  // 4. Invalidated hypothesis — T3 gate target (reconciler returns ok:false for non-proposed statuses)
  fs.writeFileSync(
    path.join(root, "00-problem-hypotheses", "0004-hyp-invalidated.md"),
    [
      "---",
      "id: PROB-0004",
      "status: invalidated",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Hypothesis: dark mode increases engagement",
    ].join("\n"),
    "utf8",
  );

  // SOL linked to PROB-0003 — makes activeSolutionHypothesesForHypothesis return non-empty
  // so reconcileDiscovery returns {ok:true, commands:[]} (idle) for T2, not SolutionDesigner.
  fs.writeFileSync(
    path.join(root, "02-solution-hypotheses", "0001-sol-for-accepted-hyp.md"),
    [
      "---",
      "id: SOL-0001",
      "status: proposed",
      "problem_hypothesis_id: PROB-0003",
      "target_metric_id: MET-0001",
      "---",
      "",
      "# Solution: optimise query caching layer",
    ].join("\n"),
    "utf8",
  );

  // 5. Feature sentinel — detects cross-directory side-effects
  fs.writeFileSync(
    path.join(root, "03-features", "0001-sentinel.md"),
    [
      "---",
      "id: FEAT-0001",
      "status: proposed",
      "solution_hypothesis_id: SOL-0001",
      "---",
      "",
      "# Sentinel feature",
    ].join("\n"),
    "utf8",
  );

  // 6. Task sentinel — detects cross-directory side-effects
  fs.writeFileSync(
    path.join(root, "04-tasks", "0001-sentinel.md"),
    [
      "---",
      "id: TASK-0001",
      "status: todo",
      "feature_id: FEAT-0001",
      "---",
      "",
      "# Sentinel task",
    ].join("\n"),
    "utf8",
  );

  // 7. Metric sentinel — detects cross-directory side-effects; also target_metric_id for SOL-0001
  fs.writeFileSync(
    path.join(root, "01-metrics", "0001-sentinel.md"),
    ["---", "id: MET-0001", "status: proposed", "---", "", "# Sentinel metric"].join("\n"),
    "utf8",
  );

  // Orchestration log — discover-cmd appends here after executing commands
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
