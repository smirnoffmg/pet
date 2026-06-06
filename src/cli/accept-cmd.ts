import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { confirm } from "@inquirer/prompts";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { ADR_DIR } from "@/store/paths.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { QaPlanFrontmatter } from "@/schemas/qa-plan.js";
import type { ReleaseFrontmatter } from "@/schemas/release.js";

export async function runAcceptHypothesis(
  hypothesisId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find(
    (a) => a.kind === "hypothesis" && a.frontmatter.id === hypothesisId,
  );
  if (!artifact) {
    console.error(`Hypothesis not found: ${hypothesisId}`);
    return 1;
  }

  const fm = artifact.frontmatter as HypothesisFrontmatter;
  if (fm.status === "accepted") {
    console.log(
      `Hypothesis ${hypothesisId} is already accepted. Run \`pet discover --hypothesis ${hypothesisId}\`.`,
    );
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Hypothesis ${hypothesisId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept hypothesis ${hypothesisId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Accepted ${hypothesisId}. Run \`pet validate\` before commit.`);
  return 0;
}

export async function runAcceptSolutionHypothesis(
  solutionHypothesisId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
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
  if (fm.status === "accepted") {
    console.log(
      `Solution hypothesis ${solutionHypothesisId} is already accepted. Run \`pet discover --solution-hypothesis ${solutionHypothesisId}\`.`,
    );
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Solution hypothesis ${solutionHypothesisId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept solution hypothesis ${solutionHypothesisId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(
    `Accepted ${solutionHypothesisId}. Run \`pet discover --solution-hypothesis ${solutionHypothesisId}\` next.`,
  );
  return 0;
}

export async function runAcceptFeature(
  featureId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find((a) => a.kind === "feature" && a.frontmatter.id === featureId);
  if (!artifact) {
    console.error(`Feature not found: ${featureId}`);
    return 1;
  }

  const fm = artifact.frontmatter as FeatureFrontmatter;
  if (fm.status === "accepted") {
    console.log(
      `Feature ${featureId} is already accepted. Run \`pet deliver --feature ${featureId}\`.`,
    );
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Feature ${featureId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept feature ${featureId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Accepted ${featureId}. Run \`pet deliver --feature ${featureId}\` next.`);
  return 0;
}

export async function runAcceptAdr(adrArg: string, opts: { yes?: boolean } = {}): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const n = Number.parseInt(adrArg.replace(/^0+/, "") || "0", 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error(`Invalid ADR number: ${adrArg}`);
    return 1;
  }

  const adrDir = path.join(root, ADR_DIR);
  if (!fs.existsSync(adrDir)) {
    console.error(`ADR directory not found: ${adrDir}`);
    return 1;
  }

  const padded = String(n).padStart(4, "0");
  const files = fs
    .readdirSync(adrDir)
    .filter((f) => f.startsWith(`${padded}-`) && f.endsWith(".md"));
  if (files.length === 0) {
    console.error(`ADR not found: ${adrArg}`);
    return 1;
  }
  const filename = files[0]!;
  const filePath = path.join(adrDir, filename);

  const raw = fs.readFileSync(filePath, "utf8");
  const statusMatch = /^## Status\s*\n+(\w+)/m.exec(raw);
  const currentStatus = statusMatch?.[1]?.trim() ?? "";

  if (currentStatus.toLowerCase() === "accepted") {
    console.log(`ADR ${n} is already accepted.`);
    return 0;
  }
  if (currentStatus.toLowerCase() !== "proposed") {
    console.error(
      `ADR ${n} cannot be accepted from status "${currentStatus}" (only Proposed → Accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept ADR ${n}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const updated = raw.replace(/^(## Status\s*\n+)\w+/m, "$1Accepted");
  fs.writeFileSync(filePath, updated, "utf8");

  console.log(`Accepted ADR ${n}.`);
  return 0;
}

export async function runAcceptMetric(
  metricId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find((a) => a.kind === "metric" && a.frontmatter.id === metricId);
  if (!artifact) {
    console.error(`Metric not found: ${metricId}`);
    return 1;
  }

  const fm = artifact.frontmatter as TargetMetricFrontmatter;
  if (fm.status === "accepted") {
    console.log(`Metric ${metricId} is already accepted.`);
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Metric ${metricId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept metric ${metricId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Accepted ${metricId}.`);
  return 0;
}

export async function runAcceptQaPlan(
  qaPlanId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find((a) => a.kind === "qa_plan" && a.frontmatter.id === qaPlanId);
  if (!artifact) {
    console.error(`QA plan not found: ${qaPlanId}`);
    return 1;
  }

  const fm = artifact.frontmatter as QaPlanFrontmatter;
  if (fm.status === "accepted") {
    console.log(`QA plan ${qaPlanId} is already accepted.`);
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `QA plan ${qaPlanId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept QA plan ${qaPlanId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Accepted ${qaPlanId}.`);
  return 0;
}

export async function runAcceptRelease(
  releaseId: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find((a) => a.kind === "release" && a.frontmatter.id === releaseId);
  if (!artifact) {
    console.error(`Release not found: ${releaseId}`);
    return 1;
  }

  const fm = artifact.frontmatter as ReleaseFrontmatter;
  if (fm.status === "accepted") {
    console.log(
      `Release ${releaseId} is already accepted. Run \`pet release --release ${releaseId}\` to enrich it.`,
    );
    return 0;
  }
  if (fm.status !== "proposed") {
    console.error(
      `Release ${releaseId} cannot be accepted from status ${fm.status} (only proposed → accepted).`,
    );
    return 1;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Accept release ${releaseId}? This is a human-in-the-loop decision.`,
      default: false,
    });
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  const raw = fs.readFileSync(artifact.filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  data["status"] = "accepted";
  fs.writeFileSync(artifact.filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Accepted ${releaseId}.`);
  return 0;
}
