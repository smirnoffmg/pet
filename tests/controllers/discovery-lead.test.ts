import { describe, expect, it } from "vitest";
import { reconcileDiscovery } from "@/controllers/discovery-lead.js";
import {
  featureIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";
import type { ArtifactSnapshot } from "@/agents/types.js";
import type { ParsedArtifact } from "@/store/parse.js";
import { metricIdSchema } from "@/schemas/ids.js";

function metric(id: string, hypothesisId: string, status: "proposed" | "accepted"): ParsedArtifact {
  return {
    kind: "metric",
    filePath: `/doc/product/01-metrics/${id}.md`,
    relativePath: `product/01-metrics/${id}.md`,
    frontmatter: {
      id: metricIdSchema.parse(id),
      status,
      problem_hypothesis_id: problemHypothesisIdSchema.parse(hypothesisId),
    },
    body: "# Metric\n",
  };
}

function hypothesis(
  id: string,
  status: "proposed" | "accepted" | "superseded",
  body: string,
): ParsedArtifact {
  return {
    kind: "hypothesis",
    filePath: `/doc/product/00-problem-hypotheses/${id}.md`,
    relativePath: `product/00-problem-hypotheses/${id}.md`,
    frontmatter: {
      id: problemHypothesisIdSchema.parse(id),
      status,
    },
    body,
  };
}

function solutionHypothesis(
  id: string,
  metricId: string,
  status: "proposed" | "accepted" | "superseded",
): ParsedArtifact {
  return {
    kind: "solution_hypothesis",
    filePath: `/doc/product/02-solution-hypotheses/${id}.md`,
    relativePath: `product/02-solution-hypotheses/${id}.md`,
    frontmatter: {
      id: solutionHypothesisIdSchema.parse(id),
      status,
      metric_ids: [metricIdSchema.parse(metricId)],
    },
    body: "# Solution\n",
  };
}

function snap(partial: Partial<ArtifactSnapshot>): ArtifactSnapshot {
  const metrics = partial.metrics ?? [];
  return {
    metrics,
    hypotheses: partial.hypotheses ?? [],
    solutionHypotheses: partial.solutionHypotheses ?? [],
    features: partial.features ?? [],
    tasks: partial.tasks ?? [],
    releases: partial.releases ?? [],
    qaPlansByFeatureId: partial.qaPlansByFeatureId ?? new Map(),
    byMetricId: partial.byMetricId ?? new Map(),
    byHypothesisId: partial.byHypothesisId ?? new Map(),
    bySolutionHypothesisId: partial.bySolutionHypothesisId ?? new Map(),
    byFeatureId: partial.byFeatureId ?? new Map(),
    tasksByFeatureId: partial.tasksByFeatureId ?? new Map(),
    byReleaseId: partial.byReleaseId ?? new Map(),
    metricsByHypothesisId:
      partial.metricsByHypothesisId ??
      metrics.reduce((map, m) => {
        const hypId = (m.frontmatter as { problem_hypothesis_id?: string }).problem_hypothesis_id;
        if (hypId) {
          map.set(hypId, [...(map.get(hypId) ?? []), m]);
        }
        return map;
      }, new Map<string, ParsedArtifact[]>()),
  };
}

describe("reconcileDiscovery", () => {
  it("spawns Researcher when hypothesis proposed with empty evidence", () => {
    const h = hypothesis("PROB-0001", "proposed", "# H\n\n## Evidence\n\n_To be filled.\n");
    const snapshot = snap({
      hypotheses: [h],
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_researcher");
    }
  });

  it("spawns Researcher when proposed hypothesis has only blank lines before next ## heading (TASK-0016 regex boundary)", () => {
    const h = hypothesis("PROB-0001", "proposed", "# H\n\n## Evidence\n\n## Next Section\n");
    const snapshot = snap({
      hypotheses: [h],
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_researcher");
    }
  });

  it("spawns Researcher when hypothesis proposed with existing evidence (T4 augment case)", () => {
    const h = hypothesis(
      "PROB-0001",
      "proposed",
      "# H\n\n## Evidence\n\nPrior study: n=150, p=0.03.\n",
    );
    const snapshot = snap({
      hypotheses: [h],
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_researcher");
    }
  });

  it("spawns SolutionDesigner when hypothesis accepted and has no solution hypotheses", () => {
    const h = hypothesis("PROB-0001", "accepted", "# H\n\n## Evidence\n\nDone.\n");
    const snapshot = snap({
      hypotheses: [h],
      solutionHypotheses: [],
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_solution_designer");
    }
  });

  it("passes metrics to SolutionDesigner brief when metrics for the hypothesis exist", () => {
    const m = metric("MET-0001", "PROB-0001", "accepted");
    const h = hypothesis("PROB-0001", "accepted", "# H\n\n## Evidence\n\nDone.\n");
    const snapshot = snap({
      metrics: [m],
      hypotheses: [h],
      solutionHypotheses: [],
      byMetricId: new Map([[m.frontmatter.id, m]]),
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cmd = result.commands[0];
      expect(cmd?.kind).toBe("spawn_solution_designer");
      if (cmd?.kind === "spawn_solution_designer") {
        expect(cmd.brief.metrics[0]?.metricId).toBe("MET-0001");
      }
    }
  });

  it("is idle when accepted hypothesis already has an active solution hypothesis", () => {
    const m = metric("MET-0001", "PROB-0001", "accepted");
    const h = hypothesis("PROB-0001", "accepted", "# H\n\n## Evidence\n\nDone.\n");
    const sh = solutionHypothesis("SOL-0001", "MET-0001", "proposed");
    const snapshot = snap({
      metrics: [m],
      hypotheses: [h],
      solutionHypotheses: [sh],
      byHypothesisId: new Map([[h.frontmatter.id, h]]),
      bySolutionHypothesisId: new Map([[sh.frontmatter.id, sh]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "hypothesis",
      hypothesisId: "PROB-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(0);
    }
  });

  it("spawns FeatureDesigner when solution hypothesis accepted and has no features", () => {
    const sh = solutionHypothesis("SOL-0001", "MET-0001", "accepted");
    const snapshot = snap({
      solutionHypotheses: [sh],
      features: [],
      bySolutionHypothesisId: new Map([[sh.frontmatter.id, sh]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "solution_hypothesis",
      solutionHypothesisId: "SOL-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_feature_designer");
    }
  });

  it("is idle when accepted solution hypothesis already has features", () => {
    const sh = solutionHypothesis("SOL-0001", "MET-0001", "accepted");
    const f = {
      kind: "feature" as const,
      filePath: "/doc/product/03-features/0001-f.md",
      relativePath: "product/03-features/0001-f.md",
      frontmatter: {
        id: featureIdSchema.parse("FEAT-0001"),
        status: "proposed" as const,
        solution_hypothesis_id: solutionHypothesisIdSchema.parse("SOL-0001"),
        architectural_review_status: "pending" as const,
      },
      body: "# F\n",
    };
    const snapshot = snap({
      solutionHypotheses: [sh],
      features: [f],
      bySolutionHypothesisId: new Map([[sh.frontmatter.id, sh]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "solution_hypothesis",
      solutionHypothesisId: "SOL-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(0);
    }
  });

  it("is idle (not error) when solution hypothesis is proposed — no filler agent yet", () => {
    const sh = solutionHypothesis("SOL-0001", "MET-0001", "proposed");
    const snapshot = snap({
      solutionHypotheses: [sh],
      bySolutionHypothesisId: new Map([[sh.frontmatter.id, sh]]),
    });
    const result = reconcileDiscovery(snapshot, {
      type: "solution_hypothesis",
      solutionHypothesisId: "SOL-0001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commands).toHaveLength(0);
  });

  it("spawns Designer enrich for scaffold feature with solution_hypothesis_id", () => {
    const sh = solutionHypothesis("SOL-0001", "MET-0001", "accepted");
    const f = {
      kind: "feature" as const,
      filePath: "/doc/product/03-features/0004-f.md",
      relativePath: "product/03-features/0004-f.md",
      frontmatter: {
        id: featureIdSchema.parse("FEAT-0004"),
        status: "accepted" as const,
        solution_hypothesis_id: solutionHypothesisIdSchema.parse("SOL-0001"),
        architectural_review_status: "cleared" as const,
      },
      body: "# Title\n\n## Context\n\n## Decision\n\n## Acceptance criteria\n\n## Consequences\n",
    };
    const snapshot = snap({
      solutionHypotheses: [sh],
      features: [f],
      bySolutionHypothesisId: new Map([[sh.frontmatter.id, sh]]),
      byFeatureId: new Map([[f.frontmatter.id, f]]),
    });
    const result = reconcileDiscovery(snapshot, { type: "feature", featureId: "FEAT-0004" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands[0]?.kind).toBe("spawn_designer_enrich");
    }
  });
});
