import fs from "node:fs";
import path from "node:path";
import { confirm, input, select } from "@inquirer/prompts";
import { classifyIntent, type Intent } from "./heuristic-classifier.js";
import { deriveTitle } from "./derive-title.js";
import { runOrchestrate } from "@/cli/orchestrate-cmd.js";
import { runDiscover } from "@/cli/discover-cmd.js";
import { runDeliver } from "@/cli/deliver-cmd.js";
import { allocateNextId, scanArtifacts, writeArtifact } from "@/store/index.js";
import { docRoot } from "@/store/repo-root.js";
import { extractTitle } from "@/controllers/discovery-helpers.js";
import {
  problemHypothesisIdSchema,
  metricIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";
import type { HypothesisFrontmatter, SolutionHypothesisFrontmatter } from "@/schemas/index.js";
import type { ParsedArtifact } from "@/store/parse.js";

type ResolvedIntent = Exclude<Intent, "ambiguous">;

async function handleExploreProblem(userInput: string, repoRoot: string): Promise<void> {
  const title = deriveTitle(userInput);

  const shouldScaffold = await confirm({
    message: `I'll create a new hypothesis: «${title}». Shall I proceed?`,
    default: true,
  });

  if (!shouldScaffold) {
    process.stdout.write("Okay. Run `pet new hypothesis` whenever you're ready.\n");
    return;
  }

  const root = docRoot(repoRoot);
  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    process.stderr.write(`Failed to scan artifacts: ${scan.error.message}\n`);
    return;
  }

  const id = allocateNextId("hypothesis", scan.value);
  const fm: HypothesisFrontmatter = {
    id: problemHypothesisIdSchema.parse(id),
    status: "proposed",
  };

  const written = writeArtifact(root, "hypothesis", fm, title);
  if (written.isErr()) {
    process.stderr.write(`Failed to write hypothesis: ${written.error.message}\n`);
    return;
  }

  const relativePath = path.relative(repoRoot, written.value);
  process.stdout.write(`Created hypothesis at ${relativePath}\n`);

  const shouldRunResearcher = await confirm({
    message: "Would you like me to run the Researcher on this now?",
    default: true,
  });

  if (shouldRunResearcher) {
    await runDiscover({ hypothesis: id });
  }

  process.stdout.write(`Next: pet discover --hypothesis ${id}\n`);
}

function findMostRecentProposedSolution(artifacts: ParsedArtifact[]): ParsedArtifact | undefined {
  const proposed = artifacts.filter(
    (a) =>
      a.kind === "solution_hypothesis" &&
      (a.frontmatter as SolutionHypothesisFrontmatter).status === "proposed",
  );
  if (proposed.length === 0) return undefined;
  if (proposed.length === 1) return proposed[0];
  return proposed.reduce((most, current) =>
    fs.statSync(current.filePath).mtimeMs > fs.statSync(most.filePath).mtimeMs ? current : most,
  );
}

async function scaffoldNewSolutionHypothesis(
  userInput: string,
  docRootPath: string,
  artifacts: ParsedArtifact[],
): Promise<{ id: string; filePath: string } | undefined> {
  const hypotheses = artifacts.filter((a) => a.kind === "hypothesis");
  if (hypotheses.length === 0) {
    process.stderr.write("No hypotheses found. Create one with: pet new hypothesis\n");
    return undefined;
  }
  const metricChoices = artifacts
    .filter((a) => a.kind === "metric")
    .map((a) => ({ name: a.frontmatter.id, value: a.frontmatter.id }));
  if (metricChoices.length === 0) {
    process.stderr.write("No metrics found. Create one with: pet new metric\n");
    return undefined;
  }

  const targetMetricId = await select<string>({
    message: "Target metric",
    choices: metricChoices,
  });

  const title = deriveTitle(userInput);
  const newId = allocateNextId("solution_hypothesis", artifacts);
  const fm: SolutionHypothesisFrontmatter = {
    id: solutionHypothesisIdSchema.parse(newId),
    status: "proposed",
    metric_ids: [metricIdSchema.parse(targetMetricId)],
  };

  const written = writeArtifact(docRootPath, "solution_hypothesis", fm, title);
  if (written.isErr()) {
    process.stderr.write(`Failed to write solution-hypothesis: ${written.error.message}\n`);
    return undefined;
  }

  return { id: newId, filePath: written.value };
}

async function handleDesignSolution(userInput: string, repoRoot: string): Promise<void> {
  const root = docRoot(repoRoot);
  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    process.stderr.write(`Failed to scan artifacts: ${scan.error.message}\n`);
    return;
  }

  let solutionId: string | undefined;
  let solutionPath: string | undefined;

  const existing = findMostRecentProposedSolution(scan.value);
  if (existing) {
    const existingTitle = extractTitle(existing.body, existing.frontmatter.id);
    const reuseExisting = await confirm({
      message: `I found an existing proposed solution: ${existing.frontmatter.id} — «${existingTitle}». Use this one?`,
      default: true,
    });
    if (reuseExisting) {
      solutionId = existing.frontmatter.id;
      solutionPath = existing.filePath;
    }
  }

  if (!solutionId || !solutionPath) {
    const created = await scaffoldNewSolutionHypothesis(userInput, root, scan.value);
    if (!created) {
      return;
    }
    solutionId = created.id;
    solutionPath = created.filePath;
  }

  const relativePath = path.relative(repoRoot, solutionPath);
  process.stdout.write(`Using solution-hypothesis at ${relativePath}\n`);

  const shouldRunDelivery = await confirm({
    message: "Would you like me to run the Delivery Lead on this now?",
    default: true,
  });

  if (shouldRunDelivery) {
    await runDeliver({ feature: solutionId });
  }

  process.stdout.write(`Next: pet deliver --solution ${solutionId}\n`);
}

async function handleStatus(repoRoot: string): Promise<void> {
  void repoRoot;
  await runOrchestrate({ dryRun: true });
  process.stdout.write("Next: pet orchestrate\n");
}

export async function runChatSession(opts: { repoRoot: string }): Promise<void> {
  process.stdout.write(
    "Welcome to pet chat. I'll help you create the right artifact and kick off the right controller.\n",
  );

  const userInput = await input({
    message: "What problem are you trying to solve, or what would you like to do?",
  });

  const classified = classifyIntent(userInput);
  let resolved: ResolvedIntent;
  if (classified === "ambiguous") {
    resolved = await select<ResolvedIntent>({
      message: "What would you like to do?",
      choices: [
        { value: "explore-problem", name: "Explore / research a problem" },
        { value: "design-solution", name: "Design or build a solution" },
        { value: "status", name: "Check status / see what's pending" },
      ],
    });
  } else {
    resolved = classified;
  }

  if (process.env["PET_DEBUG"] === "1") {
    process.stderr.write(`[pet chat] resolved intent: ${resolved}\n`);
  }

  switch (resolved) {
    case "explore-problem":
      await handleExploreProblem(userInput, opts.repoRoot);
      return;
    case "design-solution":
      await handleDesignSolution(userInput, opts.repoRoot);
      return;
    case "status":
      await handleStatus(opts.repoRoot);
      return;
  }
}
