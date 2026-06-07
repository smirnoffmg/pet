const CHECKLISTS: Record<string, string[]> = {
  hypothesis: [
    "Problem is specific to a real user group, not hypothetical",
    'Evidence section contains observations, data, or research — not "TBD"',
    "At least one target metric is linked",
    "The hypothesis is falsifiable (a negative outcome is conceivable)",
  ],
  solution_hypothesis: [
    "Solution clearly addresses the linked problem hypothesis",
    "Mechanism (how it solves the problem) is described",
    "Risks or unknowns are acknowledged",
    "Linked to a target metric",
  ],
  feature: [
    "Body contains real acceptance criteria — not scaffold placeholder text",
    "Scope is bounded (what is out of scope is clear)",
    "Positive and negative consequences are listed",
    "Traces to an accepted solution hypothesis",
  ],
  metric: [
    "The metric is measurable in practice",
    "A baseline or current state is described",
    "A success threshold or target is defined",
  ],
  qa_plan: [
    "Test cases are specific enough to execute",
    "Edge cases and failure modes are covered",
    "Pass/fail criteria are defined",
  ],
  release: [
    "Deployment steps include a rollback procedure",
    "All referenced features are in a releasable state",
    "A smoke test or verification plan is included",
  ],
  adr: [
    "At least two alternatives were considered and documented",
    "Consequences (positive and negative) are listed",
    "Decision and rationale are clearly stated",
  ],
};

export function printDiscernmentChecklist(kind: string, id: string): void {
  const items = CHECKLISTS[kind];
  if (!items || items.length === 0) return;

  process.stdout.write(`\nDiscernment checklist — ${id} (${kind.replace("_", "-")})\n`);
  for (const item of items) {
    process.stdout.write(`  ▸ ${item}\n`);
  }
  process.stdout.write("Review each item before confirming.\n\n");
}
