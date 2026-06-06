import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface PipelineFixtureContext {
  /** doc/ root — pass this as docRoot to runLiveAgent. */
  docRoot: string;
  /** doc/product/ subtree — snapshot this for per-step assertions. */
  productRoot: string;
  /** Removes the entire temp directory synchronously. */
  cleanup(): void;
}

/**
 * Creates a minimal pipeline fixture with all required artifact directories.
 *
 * Layout (relative to tmp/):
 *   doc/
 *     adr/                             — empty; Architect may write here
 *     product/
 *       hypotheses/
 *         0001-users-need-faster-onboarding.md   — PROB-0001, proposed, empty Evidence
 *       metrics/
 *         0001-time-to-first-value.md            — MET-0001, proposed (FK target for SOL)
 *       solution_hypotheses/           — empty; SolutionDesigner writes here
 *       features/                      — empty; FeatureDesigner writes here
 *       tasks/                         — empty; TechLead / Dev writes here
 *       qa_plans/                      — empty; QA writes here
 *       releases/                      — empty; DevOps writes here
 *       orchestration/
 *         decisions.md                 — empty audit log (required by CLI infrastructure)
 *
 * Pass docRoot to runLiveAgent; snapshot productRoot for assertions.
 */
export function createPipelineFixture(): PipelineFixtureContext {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-pipeline-fixture-"));
  const docRoot = path.join(tmp, "doc");
  const productRoot = path.join(docRoot, "product");

  for (const dir of [
    "adr",
    "product/00-problem-hypotheses",
    "product/01-metrics",
    "product/02-solution-hypotheses",
    "product/03-features",
    "product/04-tasks",
    "product/05-qa-plans",
    "product/06-releases",
    "product/orchestration",
  ]) {
    fs.mkdirSync(path.join(docRoot, dir), { recursive: true });
  }

  fs.writeFileSync(
    path.join(productRoot, "00-problem-hypotheses", "0001-users-need-faster-onboarding.md"),
    [
      "---",
      "id: PROB-0001",
      "status: proposed",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Hypothesis: users need faster onboarding",
      "",
      "## Context",
      "",
      "Users currently spend 45 minutes on average during initial setup.",
      "Studies show attention drops sharply after 20 minutes.",
      "First-run experience is a major driver of day-7 retention.",
      "",
      "## Decision",
      "",
      "We hypothesize that streamlining the first-run flow reduces setup time below 15 minutes",
      "for 80% of new users.",
      "",
      "## Consequences",
      "",
      "If validated, prioritise onboarding flow redesign in the next sprint.",
      "",
      "## Evidence",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "01-metrics", "0001-time-to-first-value.md"),
    [
      "---",
      "id: MET-0001",
      "status: proposed",
      "target_metric_ids:",
      "  - MET-0001",
      "---",
      "",
      "# Metric: time to first value",
      "",
      "Median minutes from account creation to completing the first meaningful action.",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(productRoot, "orchestration", "decisions.md"),
    "# Orchestration decisions log\n\nAppend-only audit trail.\n",
    "utf8",
  );

  return {
    docRoot,
    productRoot,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}
