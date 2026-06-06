import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import {
  metricIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import {
  activeSolutionHypothesesForHypothesis,
  extractTitle,
  featureBodyIsScaffold,
  hasProposedOrAcceptedFeatureForSolutionHypothesis,
} from "./discovery-helpers.js";

export type DiscoveryTarget =
  | { type: "hypothesis"; hypothesisId: string }
  | { type: "solution_hypothesis"; solutionHypothesisId: string }
  | { type: "feature"; featureId: string };

export type ReconcileDiscoveryResult =
  | { ok: true; commands: SubagentCommand[] }
  | { ok: false; reason: string };

/** Human-readable reason when reconcile returns no commands (not an error). */
export function explainDiscoveryIdle(snapshot: ArtifactSnapshot, target: DiscoveryTarget): string {
  if (target.type === "feature") {
    const feature = snapshot.byFeatureId.get(target.featureId);
    if (!feature || feature.kind !== "feature") {
      return `Feature ${target.featureId} not found.`;
    }
    if (!featureBodyIsScaffold(feature.body)) {
      return `Feature ${target.featureId} already has a filled body. Nothing for Designer enrich.`;
    }
    const fm = feature.frontmatter as FeatureFrontmatter;
    return `Feature ${target.featureId} body is still scaffold (status: ${fm.status}). Discovery enrich should apply; check reconcile errors.`;
  }

  if (target.type === "solution_hypothesis") {
    const sh = snapshot.bySolutionHypothesisId.get(target.solutionHypothesisId);
    if (!sh || sh.kind !== "solution_hypothesis") {
      return `Solution hypothesis ${target.solutionHypothesisId} not found.`;
    }
    const fm = sh.frontmatter as SolutionHypothesisFrontmatter;
    if (fm.status === "accepted") {
      const featureIds = snapshot.features
        .filter((f) => {
          if (f.kind !== "feature") return false;
          const fFm = f.frontmatter as FeatureFrontmatter;
          return (
            fFm.solution_hypothesis_id === target.solutionHypothesisId &&
            (fFm.status === "proposed" || fFm.status === "accepted")
          );
        })
        .map((f) => f.frontmatter.id)
        .join(", ");
      if (featureIds) {
        return `Solution hypothesis ${target.solutionHypothesisId} is accepted and already has feature(s): ${featureIds}. Run \`pet accept feature <id>\`, then \`pet deliver --feature <id>\`.`;
      }
    }
    return `No discovery step applies to ${target.solutionHypothesisId} (status: ${fm.status}).`;
  }

  const hypothesis = snapshot.byHypothesisId.get(target.hypothesisId);
  if (!hypothesis || hypothesis.kind !== "hypothesis") {
    return `Hypothesis ${target.hypothesisId} not found.`;
  }

  const fm = hypothesis.frontmatter as HypothesisFrontmatter;

  if (fm.status === "accepted") {
    const active = activeSolutionHypothesesForHypothesis(
      snapshot.solutionHypotheses,
      target.hypothesisId,
    );
    if (active.length > 0) {
      const ids = active.map((sh) => sh.frontmatter.id).join(", ");
      return `Hypothesis ${target.hypothesisId} is accepted and already has solution hypothesis(es): ${ids}. Run \`pet accept solution-hypothesis <id>\`, then \`pet discover --solution-hypothesis <id>\`.`;
    }
  }

  if (fm.status === "superseded" || fm.status === "validated" || fm.status === "invalidated") {
    return `Hypothesis ${target.hypothesisId} has status ${fm.status}; discovery does not apply.`;
  }

  return `No discovery step applies to ${target.hypothesisId} (status: ${fm.status}).`;
}

export function reconcileDiscovery(
  snapshot: ArtifactSnapshot,
  target: DiscoveryTarget,
): ReconcileDiscoveryResult {
  if (target.type === "feature") {
    return reconcileForFeature(snapshot, target.featureId);
  }
  if (target.type === "solution_hypothesis") {
    return reconcileForSolutionHypothesis(snapshot, target.solutionHypothesisId);
  }
  return reconcileForHypothesis(snapshot, target.hypothesisId);
}

function reconcileForFeature(
  snapshot: ArtifactSnapshot,
  featureId: string,
): ReconcileDiscoveryResult {
  const feature = snapshot.byFeatureId.get(featureId);
  if (!feature || feature.kind !== "feature") {
    return { ok: false, reason: `Feature not found: ${featureId}` };
  }

  const fm = feature.frontmatter as FeatureFrontmatter;
  if (fm.status !== "proposed" && fm.status !== "accepted") {
    return {
      ok: false,
      reason: `Feature ${featureId} cannot be enriched (status: ${fm.status})`,
    };
  }

  if (!featureBodyIsScaffold(feature.body)) {
    return { ok: true, commands: [] };
  }

  const featureTitle = extractTitle(feature.body, featureId);

  // New-style feature: references solution_hypothesis_id
  if (fm.solution_hypothesis_id != null) {
    const sh = snapshot.bySolutionHypothesisId.get(fm.solution_hypothesis_id);
    if (!sh || sh.kind !== "solution_hypothesis") {
      return {
        ok: false,
        reason: `Solution hypothesis ${fm.solution_hypothesis_id} not found for ${featureId}`,
      };
    }
    const shFm = sh.frontmatter as SolutionHypothesisFrontmatter;
    const shTitle = extractTitle(sh.body, fm.solution_hypothesis_id);
    return {
      ok: true,
      commands: [
        {
          kind: "spawn_designer_enrich",
          brief: {
            featureId: fm.id,
            featureTitle,
            featureBody: feature.body,
            solutionHypothesisId: shFm.id,
            solutionHypothesisTitle: shTitle,
            solutionHypothesisBody: sh.body,
          },
        },
      ],
    };
  }

  return { ok: false, reason: `Feature ${featureId} has no solution_hypothesis FK` };
}

function reconcileForHypothesis(
  snapshot: ArtifactSnapshot,
  hypothesisId: string,
): ReconcileDiscoveryResult {
  const hypothesis = snapshot.byHypothesisId.get(hypothesisId);
  if (!hypothesis || hypothesis.kind !== "hypothesis") {
    return { ok: false, reason: `Hypothesis not found: ${hypothesisId}` };
  }

  const fm = hypothesis.frontmatter as HypothesisFrontmatter;
  const title = extractTitle(hypothesis.body, hypothesisId);

  if (fm.status === "proposed") {
    return {
      ok: true,
      commands: [
        {
          kind: "spawn_researcher",
          brief: {
            hypothesisId: problemHypothesisIdSchema.parse(fm.id),
            hypothesisTitle: title,
            hypothesisBody: hypothesis.body,
          },
        },
      ],
    };
  }

  if (fm.status === "accepted") {
    const active = activeSolutionHypothesesForHypothesis(snapshot.solutionHypotheses, hypothesisId);
    if (active.length > 0) {
      return { ok: true, commands: [] };
    }
    const acceptedMetric = snapshot.metrics.find((m) => {
      const mFm = m.frontmatter as TargetMetricFrontmatter;
      return mFm.status === "accepted";
    });
    const metricFields = acceptedMetric
      ? {
          metricId: metricIdSchema.parse(
            (acceptedMetric.frontmatter as TargetMetricFrontmatter).id,
          ),
          metricTitle: extractTitle(
            acceptedMetric.body,
            (acceptedMetric.frontmatter as TargetMetricFrontmatter).id,
          ),
          metricBody: acceptedMetric.body,
        }
      : {};
    return {
      ok: true,
      commands: [
        {
          kind: "spawn_solution_designer",
          brief: {
            hypothesisId: problemHypothesisIdSchema.parse(fm.id),
            hypothesisTitle: title,
            hypothesisBody: hypothesis.body,
            ...metricFields,
          },
        },
      ],
    };
  }

  return {
    ok: false,
    reason: `Hypothesis ${hypothesisId} is not eligible for discovery (status: ${fm.status})`,
  };
}

function reconcileForSolutionHypothesis(
  snapshot: ArtifactSnapshot,
  solutionHypothesisId: string,
): ReconcileDiscoveryResult {
  const sh = snapshot.bySolutionHypothesisId.get(solutionHypothesisId);
  if (!sh || sh.kind !== "solution_hypothesis") {
    return { ok: false, reason: `Solution hypothesis not found: ${solutionHypothesisId}` };
  }

  const fm = sh.frontmatter as SolutionHypothesisFrontmatter;

  if (fm.status !== "accepted") {
    return {
      ok: false,
      reason: `Solution hypothesis ${solutionHypothesisId} must be accepted before discovery (status: ${fm.status}). Run \`pet accept solution-hypothesis ${solutionHypothesisId}\`.`,
    };
  }

  if (hasProposedOrAcceptedFeatureForSolutionHypothesis(snapshot.features, solutionHypothesisId)) {
    return { ok: true, commands: [] };
  }

  const title = extractTitle(sh.body, solutionHypothesisId);
  return {
    ok: true,
    commands: [
      {
        kind: "spawn_feature_designer",
        brief: {
          solutionHypothesisId: solutionHypothesisIdSchema.parse(fm.id),
          solutionHypothesisTitle: title,
          solutionHypothesisBody: sh.body,
        },
      },
    ],
  };
}
