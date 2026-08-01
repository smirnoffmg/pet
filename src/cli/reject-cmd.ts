import { confirmGate } from "./confirm-gate.js";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { formatReport } from "@/validators/index.js";
import { appendOrchestrationDecision } from "@/controllers/orchestration-log.js";
import { atomicFrontmatterUpdate } from "./atomic-update.js";
import { printRejectionChecklist } from "./discernment.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";

export async function runRejectSolutionHypothesis(
  solutionHypothesisId: string,
  opts: { rationale?: string; yes?: boolean } = {},
): Promise<number> {
  const rationale = opts.rationale?.trim();
  if (!rationale) {
    console.error(
      `Rejecting an alternative requires a rationale. Run:\n` +
        `  pet reject solution-hypothesis ${solutionHypothesisId} --rationale "<why this was not chosen>"`,
    );
    return 1;
  }

  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find(
    (a) => a.kind === "solution_hypothesis" && a.frontmatter.id === solutionHypothesisId,
  );
  if (!artifact) {
    console.error(`Solution hypothesis not found: ${solutionHypothesisId}`);
    return 1;
  }

  const fm = artifact.frontmatter as SolutionHypothesisFrontmatter;
  if (fm.status === "rejected") {
    console.log(`Solution hypothesis ${solutionHypothesisId} is already rejected.`);
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Solution hypothesis ${solutionHypothesisId} cannot be rejected from status ${fm.status} ` +
        `(only proposed → rejected). An accepted decision is retired by supersession: create a new ` +
        `artifact with \`supersedes: ${solutionHypothesisId}\`, then set \`superseded_by\` on the old one.`,
    );
    return 1;
  }

  // FK validation is status-blind, so a rejected solution stays a valid reference
  // target and its features keep pointing at intent that was abandoned.
  const dependents = scan.value.filter(
    (a) =>
      a.kind === "feature" &&
      (a.frontmatter as FeatureFrontmatter).solution_hypothesis_id === solutionHypothesisId &&
      (a.frontmatter as FeatureFrontmatter).status !== "superseded",
  );
  if (dependents.length > 0) {
    const ids = dependents.map((a) => a.frontmatter.id).join(", ");
    console.warn(
      `Warning: ${dependents.length} active feature(s) still reference ${solutionHypothesisId}: ${ids}\n` +
        `They will keep validating, but they now trace to a rejected solution.`,
    );
  }

  if (!opts.yes) {
    printRejectionChecklist("solution_hypothesis", solutionHypothesisId);
    // Kept under 80 columns on purpose: a wrapped prompt repaints badly in any
    // terminal. The permanence warning lives in the checklist just above.
    const ok = await confirmGate(`Reject ${solutionHypothesisId}? This is final once committed.`);
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const result = atomicFrontmatterUpdate(
    artifact.filePath,
    { status: "rejected", rejection_rationale: rationale },
    root,
    repoRoot,
  );
  if (result.isErr()) {
    console.error(formatReport(result.error));
    return 1;
  }

  // Only after validation succeeds: a rolled-back artifact would leave a lying log line.
  appendOrchestrationDecision(
    root,
    `reject solution-hypothesis ${solutionHypothesisId}: ${rationale}`,
  );

  console.log(`Rejected ${solutionHypothesisId}. Run \`pet validate\` before commit.`);
  return 0;
}
