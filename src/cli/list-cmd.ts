import fs from "node:fs";
import path from "node:path";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { ADR_DIR } from "@/store/paths.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { ArtifactKind } from "@/schemas/ids.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";

const KIND_ALIASES: Record<string, ArtifactKind> = {
  metric: "metric",
  metrics: "metric",
  hypothesis: "hypothesis",
  hypotheses: "hypothesis",
  hyp: "hypothesis",
  solution: "solution_hypothesis",
  solutions: "solution_hypothesis",
  "solution-hypothesis": "solution_hypothesis",
  "solution-hypotheses": "solution_hypothesis",
  sol: "solution_hypothesis",
  feature: "feature",
  features: "feature",
  feat: "feature",
  task: "task",
  tasks: "task",
  release: "release",
  releases: "release",
};

type WithStatus = { id: string; status: string };

function fm(artifact: ParsedArtifact): WithStatus {
  return artifact.frontmatter as unknown as WithStatus;
}

function title(artifact: ParsedArtifact): string {
  const match = /^#[ \t]+(.+)$/m.exec(artifact.body);
  return match?.[1]?.trim() ?? "(no title)";
}

function badge(status: string): string {
  if (status === "accepted") return "+";
  if (status === "superseded") return "-";
  return "~";
}

function row(indent: string, artifact: ParsedArtifact): void {
  const { id, status } = fm(artifact);
  console.log(
    `${indent}${badge(status)} ${id.padEnd(9)}  ${status.padEnd(10)}  ${title(artifact)}`,
  );
}

function byId(a: ParsedArtifact, b: ParsedArtifact): number {
  return a.frontmatter.id.localeCompare(b.frontmatter.id);
}

function active(artifact: ParsedArtifact): boolean {
  return fm(artifact).status !== "superseded";
}

function printPipeline(artifacts: ParsedArtifact[]): void {
  console.log("  Legend: + accepted  ~ proposed  - superseded\n");

  const hyps = artifacts.filter((a) => a.kind === "hypothesis" && active(a)).sort(byId);
  const sols = artifacts.filter((a) => a.kind === "solution_hypothesis");
  const feats = artifacts.filter((a) => a.kind === "feature");
  const metricById = new Map<string, ParsedArtifact>(
    artifacts.filter((a) => a.kind === "metric").map((m) => [m.frontmatter.id as string, m]),
  );
  const hypothesisIdForSol = (sol: ParsedArtifact): string | undefined => {
    const ids = (sol.frontmatter as SolutionHypothesisFrontmatter).metric_ids as string[];
    for (const mid of ids) {
      const met = metricById.get(mid);
      if (met) return (met.frontmatter as TargetMetricFrontmatter).problem_hypothesis_id as string;
    }
    return undefined;
  };

  for (const hyp of hyps) {
    row("", hyp);

    const hypSols = sols
      .filter((s) => hypothesisIdForSol(s) === fm(hyp).id)
      .filter(active)
      .sort(byId);

    for (const sol of hypSols) {
      row("  ", sol);

      const solFeats = feats
        .filter((f) => (f.frontmatter as FeatureFrontmatter).solution_hypothesis_id === fm(sol).id)
        .filter(active)
        .sort(byId);

      for (const feat of solFeats) {
        row("    ", feat);
      }
    }
  }

  const metrics = artifacts.filter((a) => a.kind === "metric" && active(a)).sort(byId);
  const releases = artifacts.filter((a) => a.kind === "release" && active(a)).sort(byId);

  if (metrics.length > 0 || releases.length > 0) {
    console.log("");
    for (const m of metrics) row("", m);
    for (const r of releases) row("", r);
  }
}

function printKindList(artifacts: ParsedArtifact[], kind: ArtifactKind): void {
  const filtered = artifacts.filter((a) => a.kind === kind).sort(byId);
  if (filtered.length === 0) {
    console.log(`No ${kind} artifacts found.`);
    return;
  }
  console.log("  Legend: + accepted  ~ proposed  - superseded\n");
  for (const artifact of filtered) {
    row("", artifact);
  }
}

function printAdrList(): void {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const adrDir = path.join(root, ADR_DIR);

  if (!fs.existsSync(adrDir)) {
    console.log("No ADRs found (doc/adr/ does not exist).");
    return;
  }

  const files = fs
    .readdirSync(adrDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("No ADRs found.");
    return;
  }

  console.log("  Legend: + Accepted  ~ Proposed  - Superseded\n");
  for (const filename of files) {
    const raw = fs.readFileSync(path.join(adrDir, filename), "utf8");
    const titleMatch = /^#[ \t]+(.+)$/m.exec(raw);
    const titleLine = titleMatch?.[1]?.trim() ?? filename;
    const statusMatch = /^## Status\s*\n+(\w+)/m.exec(raw);
    const status = statusMatch?.[1]?.trim() ?? "Unknown";
    const numMatch = /^(\d+)-/.exec(filename);
    const num = numMatch?.[1] ?? "?";

    let b = "~";
    if (status.toLowerCase() === "accepted") b = "+";
    else if (status.toLowerCase() === "superseded") b = "-";

    console.log(`${b} ${num.padEnd(4)}  ${status.padEnd(10)}  ${titleLine}`);
  }
}

export function runList(kind?: string): number {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  if (kind === undefined) {
    printPipeline(scan.value);
    return 0;
  }

  if (kind.toLowerCase() === "adr" || kind.toLowerCase() === "adrs") {
    printAdrList();
    return 0;
  }

  const resolvedKind = KIND_ALIASES[kind.toLowerCase()];
  if (resolvedKind === undefined) {
    console.error(
      `Unknown kind: ${kind}. Valid: metrics, hypotheses, solutions, features, tasks, adrs, releases`,
    );
    return 1;
  }

  printKindList(scan.value, resolvedKind);
  return 0;
}
