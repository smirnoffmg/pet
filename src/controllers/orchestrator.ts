import type { ArtifactSnapshot, SubagentCommand } from "@/agents/types.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import {
  featureBodyIsScaffold,
  evidenceIsEmpty,
  extractTitle,
  activeSolutionHypothesesForHypothesis,
  hasProposedOrAcceptedFeatureForSolutionHypothesis,
} from "./discovery-helpers.js";
import { hasTasksForFeature } from "./snapshot.js";
import {
  featureIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";

export type OrchestratorResult =
  | { ok: true; command: SubagentCommand | null; idleReasons: string[] }
  | { ok: false; reason: string };

/** Lowest numeric ID wins within a priority tier. */
function numericId(id: string): number {
  const m = /(\d+)$/.exec(id);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : Infinity;
}

export function reconcileOrchestrator(snapshot: ArtifactSnapshot): OrchestratorResult {
  const idleReasons: string[] = [];

  // --- Priority 1: accepted FEAT- with scaffold body → DesignerEnrich ---
  const enrichCandidates = snapshot.features
    .filter((f) => {
      if (f.kind !== "feature") return false;
      const fm = f.frontmatter as FeatureFrontmatter;
      return (
        (fm.status === "accepted" || fm.status === "proposed") && featureBodyIsScaffold(f.body)
      );
    })
    .sort((a, b) => numericId(a.frontmatter.id) - numericId(b.frontmatter.id));

  const [enrichTarget] = enrichCandidates;
  if (enrichTarget !== undefined) {
    const f = enrichTarget;
    const fm = f.frontmatter as FeatureFrontmatter;
    const featureTitle = extractTitle(f.body, fm.id);
    const solHypId = fm.solution_hypothesis_id;
    const sh = solHypId ? snapshot.bySolutionHypothesisId.get(solHypId) : undefined;
    const shTitle = sh ? extractTitle(sh.body, solHypId ?? fm.id) : featureTitle;
    const shBody = sh?.body ?? "";
    return {
      ok: true,
      command: {
        kind: "spawn_designer_enrich",
        brief: {
          featureId: featureIdSchema.parse(fm.id),
          featureTitle,
          featureBody: f.body,
          solutionHypothesisId: solHypId ?? fm.id,
          solutionHypothesisTitle: shTitle,
          solutionHypothesisBody: shBody,
        },
      },
      idleReasons: [],
    };
  }

  // --- Priority 2: accepted FEAT- with non-scaffold body and no tasks → Architect ---
  const deliveryCandidates = snapshot.features
    .filter((f) => {
      if (f.kind !== "feature") return false;
      const fm = f.frontmatter as FeatureFrontmatter;
      if (fm.status !== "accepted") return false;
      if (featureBodyIsScaffold(f.body)) return false;
      const review = fm.architectural_review_status ?? "pending";
      if (review === "blocked") return false;
      return !hasTasksForFeature(snapshot, fm.id);
    })
    .sort((a, b) => numericId(a.frontmatter.id) - numericId(b.frontmatter.id));

  const [deliveryTarget] = deliveryCandidates;
  if (deliveryTarget !== undefined) {
    const f = deliveryTarget;
    const fm = f.frontmatter as FeatureFrontmatter;
    const featureTitle = extractTitle(f.body, fm.id);
    const review = fm.architectural_review_status ?? "pending";
    if (review === "pending") {
      return {
        ok: true,
        command: {
          kind: "spawn_architect",
          brief: { featureId: featureIdSchema.parse(fm.id), featureTitle, featureBody: f.body },
        },
        idleReasons: [],
      };
    }
    if (review === "cleared") {
      return {
        ok: true,
        command: {
          kind: "spawn_techlead",
          brief: { featureId: featureIdSchema.parse(fm.id), featureTitle, featureBody: f.body },
        },
        idleReasons: [],
      };
    }
  }

  // --- Priority 3: accepted SOL- with no proposed/accepted FEAT- → FeatureDesigner ---
  const solCandidates = snapshot.solutionHypotheses
    .filter((sh) => {
      if (sh.kind !== "solution_hypothesis") return false;
      const fm = sh.frontmatter as SolutionHypothesisFrontmatter;
      if (fm.status !== "accepted") return false;
      return !hasProposedOrAcceptedFeatureForSolutionHypothesis(snapshot.features, fm.id);
    })
    .sort((a, b) => numericId(a.frontmatter.id) - numericId(b.frontmatter.id));

  const [solTarget] = solCandidates;
  if (solTarget !== undefined) {
    const sh = solTarget;
    const fm = sh.frontmatter as SolutionHypothesisFrontmatter;
    const title = extractTitle(sh.body, fm.id);
    return {
      ok: true,
      command: {
        kind: "spawn_feature_designer",
        brief: {
          solutionHypothesisId: solutionHypothesisIdSchema.parse(fm.id),
          solutionHypothesisTitle: title,
          solutionHypothesisBody: sh.body,
        },
      },
      idleReasons: [],
    };
  }

  // --- Priority 4: accepted PROB- with no active SOL- → SolutionDesigner ---
  const hypAcceptedCandidates = snapshot.hypotheses
    .filter((h) => {
      if (h.kind !== "hypothesis") return false;
      const fm = h.frontmatter as HypothesisFrontmatter;
      if (fm.status !== "accepted") return false;
      const active = activeSolutionHypothesesForHypothesis(snapshot.solutionHypotheses, fm.id);
      return active.length === 0;
    })
    .sort((a, b) => numericId(a.frontmatter.id) - numericId(b.frontmatter.id));

  const [hypAccepted] = hypAcceptedCandidates;
  if (hypAccepted !== undefined) {
    const h = hypAccepted;
    const fm = h.frontmatter as HypothesisFrontmatter;
    const title = extractTitle(h.body, fm.id);
    return {
      ok: true,
      command: {
        kind: "spawn_solution_designer",
        brief: {
          hypothesisId: problemHypothesisIdSchema.parse(fm.id),
          hypothesisTitle: title,
          hypothesisBody: h.body,
        },
      },
      idleReasons: [],
    };
  }

  // --- Priority 5: proposed PROB- with empty evidence → Researcher ---
  const hypProposedCandidates = snapshot.hypotheses
    .filter((h) => {
      if (h.kind !== "hypothesis") return false;
      const fm = h.frontmatter as HypothesisFrontmatter;
      return fm.status === "proposed" && evidenceIsEmpty(h.body);
    })
    .sort((a, b) => numericId(a.frontmatter.id) - numericId(b.frontmatter.id));

  const [hypProposed] = hypProposedCandidates;
  if (hypProposed !== undefined) {
    const h = hypProposed;
    const fm = h.frontmatter as HypothesisFrontmatter;
    const title = extractTitle(h.body, fm.id);
    return {
      ok: true,
      command: {
        kind: "spawn_researcher",
        brief: {
          hypothesisId: problemHypothesisIdSchema.parse(fm.id),
          hypothesisTitle: title,
          hypothesisBody: h.body,
        },
      },
      idleReasons: [],
    };
  }

  // --- Idle: collect reasons for human review ---
  for (const h of snapshot.hypotheses) {
    if (h.kind !== "hypothesis") continue;
    const fm = h.frontmatter as HypothesisFrontmatter;
    if (fm.status === "proposed" && !evidenceIsEmpty(h.body)) {
      idleReasons.push(`${fm.id}: evidence filled — run \`pet accept hypothesis ${fm.id}\``);
    }
  }
  for (const sh of snapshot.solutionHypotheses) {
    if (sh.kind !== "solution_hypothesis") continue;
    const fm = sh.frontmatter as SolutionHypothesisFrontmatter;
    if (fm.status === "proposed") {
      idleReasons.push(`${fm.id}: proposed — run \`pet accept solution-hypothesis ${fm.id}\``);
    }
  }
  for (const f of snapshot.features) {
    if (f.kind !== "feature") continue;
    const fm = f.frontmatter as FeatureFrontmatter;
    if (fm.status === "proposed") {
      idleReasons.push(`${fm.id}: proposed — run \`pet accept feature ${fm.id}\``);
    }
    if (fm.status === "accepted" && (fm.architectural_review_status ?? "pending") === "blocked") {
      idleReasons.push(`${fm.id}: delivery blocked by architectural review`);
    }
    if (fm.status === "accepted" && hasTasksForFeature(snapshot, fm.id)) {
      idleReasons.push(`${fm.id}: tasks exist — implement or close them`);
    }
  }

  return { ok: true, command: null, idleReasons };
}
