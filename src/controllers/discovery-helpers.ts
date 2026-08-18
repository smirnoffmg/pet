import type { ParsedArtifact } from "@/store/parse.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";

export function evidenceIsEmpty(body: string): boolean {
  const match = /## Evidence[ \t]*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (!match?.[1]) {
    return true;
  }
  const content = match[1].trim();
  if (content.length === 0) {
    return true;
  }
  return /^_To be filled/i.test(content) || content === "TBD";
}

export function activeSolutionHypothesesForHypothesis(
  solutionHypotheses: ParsedArtifact[],
  metrics: ParsedArtifact[],
  hypothesisId: string,
): ParsedArtifact[] {
  const metricIds = new Set<string>(
    metrics
      .filter(
        (m) => (m.frontmatter as TargetMetricFrontmatter).problem_hypothesis_id === hypothesisId,
      )
      .map((m) => m.frontmatter.id as string),
  );
  return solutionHypotheses.filter((sh) => {
    if (sh.kind !== "solution_hypothesis") return false;
    const fm = sh.frontmatter as SolutionHypothesisFrontmatter;
    if (fm.status === "superseded") return false;
    return (fm.metric_ids as string[]).some((mid) => metricIds.has(mid));
  });
}

export function hasProposedOrAcceptedFeatureForSolutionHypothesis(
  features: ParsedArtifact[],
  solutionHypothesisId: string,
): boolean {
  return features.some((f) => {
    if (f.kind !== "feature") {
      return false;
    }
    const fm = f.frontmatter as FeatureFrontmatter;
    if (fm.solution_hypothesis_id !== solutionHypothesisId) {
      return false;
    }
    return fm.status === "proposed" || fm.status === "accepted";
  });
}

export function extractTitle(body: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1]?.trim() ?? fallback;
}

/** True when body is only a title and empty section headers (CLI template). */
export function featureBodyIsScaffold(body: string): boolean {
  const withoutTitle = body.replace(/^#\s+.+\n*/m, "");
  const withoutSectionHeaders = withoutTitle.replace(/^##\s+[^\n]+\n*/gm, "");
  return withoutSectionHeaders.trim().length === 0;
}

/** Names of ## sections whose content is empty or only whitespace, in body order. */
export function emptySectionNames(body: string): string[] {
  const parts = body.split(/^(?=## )/m);
  const names: string[] = [];
  for (const part of parts) {
    if (!part.startsWith("## ")) continue;
    const header = /^## ([^\n]+)/.exec(part);
    const content = part.replace(/^## [^\n]+\n?/, "").trim();
    if (content.length === 0 && header?.[1]) {
      names.push(header[1].trim());
    }
  }
  return names;
}

/** True when at least one ## section in the body has no content (empty or only whitespace). */
export function anySectionEmpty(body: string): boolean {
  return emptySectionNames(body).length > 0;
}

export function asMetricFm(artifact: ParsedArtifact): TargetMetricFrontmatter {
  return artifact.frontmatter as TargetMetricFrontmatter;
}

export function asHypothesisFm(artifact: ParsedArtifact): HypothesisFrontmatter {
  return artifact.frontmatter as HypothesisFrontmatter;
}

export function asSolutionHypothesisFm(artifact: ParsedArtifact): SolutionHypothesisFrontmatter {
  return artifact.frontmatter as SolutionHypothesisFrontmatter;
}
