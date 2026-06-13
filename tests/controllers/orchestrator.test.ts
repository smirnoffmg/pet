import { describe, expect, it } from "vitest";
import { reconcileOrchestrator } from "@/controllers/orchestrator.js";
import {
  featureIdSchema,
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  metricIdSchema,
} from "@/schemas/ids.js";
import type { ArtifactSnapshot } from "@/agents/types.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { TargetMetricFrontmatter } from "@/schemas/metric.js";

const EMPTY_EVIDENCE_BODY = "# H\n\n## Evidence\n\n## Consequences\n";
const FILLED_EVIDENCE_BODY = "# H\n\n## Evidence\n\nSome research here.\n\n## Consequences\n";
const SCAFFOLD_BODY =
  "# Feature\n\n## Context\n\n## Decision\n\n## Acceptance criteria\n\n## Consequences\n";
const FILLED_BODY =
  "# Feature\n\n## Context\n\nFull context here.\n\n## Decision\n\nWe will build X.\n\n## Acceptance criteria\n\n- X works.\n\n## Consequences\n\nPositive.\n";

function metric(id: string, hypothesisId: string): ParsedArtifact {
  return {
    kind: "metric",
    filePath: `/doc/product/01-metrics/${id}.md`,
    relativePath: `product/01-metrics/${id}.md`,
    frontmatter: {
      id: metricIdSchema.parse(id),
      status: "accepted",
      problem_hypothesis_id: problemHypothesisIdSchema.parse(hypothesisId),
    } satisfies TargetMetricFrontmatter,
    body: "# Metric\n",
  };
}

function hyp(
  id: string,
  status: "proposed" | "accepted" | "superseded",
  body = FILLED_EVIDENCE_BODY,
): ParsedArtifact {
  return {
    kind: "hypothesis",
    filePath: `/doc/product/00-problem-hypotheses/${id}.md`,
    relativePath: `product/00-problem-hypotheses/${id}.md`,
    frontmatter: { id: problemHypothesisIdSchema.parse(id), status },
    body,
  };
}

function sol(
  id: string,
  metId: string,
  status: "proposed" | "accepted" | "superseded",
): ParsedArtifact {
  return {
    kind: "solution_hypothesis",
    filePath: `/doc/product/02-solution-hypotheses/${id}.md`,
    relativePath: `product/02-solution-hypotheses/${id}.md`,
    frontmatter: {
      id: solutionHypothesisIdSchema.parse(id),
      status,
      metric_ids: [metricIdSchema.parse(metId)],
    },
    body: "# Solution\n",
  };
}

function feat(
  id: string,
  status: "proposed" | "accepted" | "superseded",
  body = SCAFFOLD_BODY,
  review: "pending" | "cleared" | "blocked" = "pending",
  solId = "SOL-0001",
): ParsedArtifact {
  return {
    kind: "feature",
    filePath: `/doc/product/03-features/${id}.md`,
    relativePath: `product/03-features/${id}.md`,
    frontmatter: {
      id: featureIdSchema.parse(id),
      status,
      architectural_review_status: review,
      solution_hypothesis_id: solutionHypothesisIdSchema.parse(solId),
    },
    body,
  };
}

function snap(partial: Partial<ArtifactSnapshot>): ArtifactSnapshot {
  const features = partial.features ?? [];
  const tasks = partial.tasks ?? [];
  const byFeatureId = new Map(features.map((f) => [f.frontmatter.id, f]));
  const tasksByFeatureId = new Map<string, ParsedArtifact[]>();
  for (const t of tasks) {
    const fid = (t.frontmatter as { feature_id?: string }).feature_id;
    if (fid) {
      const list = tasksByFeatureId.get(fid) ?? [];
      list.push(t);
      tasksByFeatureId.set(fid, list);
    }
  }
  return {
    metrics: partial.metrics ?? [],
    hypotheses: partial.hypotheses ?? [],
    solutionHypotheses: partial.solutionHypotheses ?? [],
    features,
    tasks,
    byMetricId: new Map((partial.metrics ?? []).map((m) => [m.frontmatter.id, m])),
    byHypothesisId: new Map((partial.hypotheses ?? []).map((h) => [h.frontmatter.id, h])),
    bySolutionHypothesisId: new Map(
      (partial.solutionHypotheses ?? []).map((s) => [s.frontmatter.id, s]),
    ),
    byFeatureId,
    tasksByFeatureId,
    releases: [],
    qaPlansByFeatureId: new Map(),
    byReleaseId: new Map(),
    metricsByHypothesisId: (() => {
      const map = new Map<string, ParsedArtifact[]>();
      for (const m of partial.metrics ?? []) {
        const fm = m.frontmatter as TargetMetricFrontmatter;
        const list = map.get(fm.problem_hypothesis_id) ?? [];
        list.push(m);
        map.set(fm.problem_hypothesis_id, list);
      }
      return map;
    })(),
  };
}

describe("reconcileOrchestrator", () => {
  it("returns null when nothing is pending", () => {
    const result = reconcileOrchestrator(snap({}));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toBeNull();
  });

  it("priority 5: proposed PROB- with empty evidence → spawn_researcher", () => {
    const result = reconcileOrchestrator(
      snap({ hypotheses: [hyp("PROB-0001", "proposed", EMPTY_EVIDENCE_BODY)] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command?.kind).toBe("spawn_researcher");
  });

  it("priority 4: accepted PROB- with no SOL- → spawn_solution_designer", () => {
    const result = reconcileOrchestrator(snap({ hypotheses: [hyp("PROB-0001", "accepted")] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command?.kind).toBe("spawn_solution_designer");
  });

  it("priority 4 suppressed when active SOL- exists", () => {
    const result = reconcileOrchestrator(
      snap({
        hypotheses: [hyp("PROB-0001", "accepted")],
        metrics: [metric("MET-0001", "PROB-0001")],
        solutionHypotheses: [sol("SOL-0001", "MET-0001", "proposed")],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toBeNull();
  });

  it("priority 3: accepted SOL- with no FEAT- → spawn_feature_designer", () => {
    const result = reconcileOrchestrator(
      snap({
        hypotheses: [hyp("PROB-0001", "accepted")],
        solutionHypotheses: [sol("SOL-0001", "MET-0001", "accepted")],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command?.kind).toBe("spawn_feature_designer");
  });

  it("priority 2: accepted FEAT- with filled body and pending review → spawn_architect", () => {
    const result = reconcileOrchestrator(
      snap({
        features: [feat("FEAT-0001", "accepted", FILLED_BODY, "pending")],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command?.kind).toBe("spawn_architect");
  });

  it("priority 2: accepted FEAT- with filled body, cleared review, no tasks → spawn_techlead", () => {
    const result = reconcileOrchestrator(
      snap({
        features: [feat("FEAT-0001", "accepted", FILLED_BODY, "cleared")],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command?.kind).toBe("spawn_techlead");
  });

  it("priority 1: accepted FEAT- with scaffold body → spawn_designer_enrich (over architect)", () => {
    const result = reconcileOrchestrator(
      snap({
        features: [
          feat("FEAT-0001", "accepted", SCAFFOLD_BODY, "cleared"),
          feat("FEAT-0002", "accepted", FILLED_BODY, "pending"),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command?.kind).toBe("spawn_designer_enrich");
      if (result.command?.kind === "spawn_designer_enrich") {
        expect(result.command.brief.featureId).toBe("FEAT-0001");
      }
    }
  });

  it("picks lowest numeric ID within same priority", () => {
    const result = reconcileOrchestrator(
      snap({
        hypotheses: [
          hyp("PROB-0003", "proposed", EMPTY_EVIDENCE_BODY),
          hyp("PROB-0001", "proposed", EMPTY_EVIDENCE_BODY),
          hyp("PROB-0002", "proposed", EMPTY_EVIDENCE_BODY),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.command?.kind === "spawn_researcher") {
      expect(result.command.brief.hypothesisId).toBe("PROB-0001");
    }
  });

  it("idle message lists HITL gates when all work is blocked there", () => {
    const result = reconcileOrchestrator(
      snap({
        hypotheses: [hyp("PROB-0001", "proposed", FILLED_EVIDENCE_BODY)],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toBeNull();
      expect(result.idleReasons.some((r) => r.includes("PROB-0001"))).toBe(true);
    }
  });
});
