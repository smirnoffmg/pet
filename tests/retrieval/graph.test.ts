import { describe, expect, it } from "vitest";
import { buildAdjacency, bfsNeighbors } from "@/retrieval/graph.js";
import { buildIndex } from "@/store/scan.js";
import type { ParsedArtifact } from "@/store/parse.js";
import {
  problemHypothesisIdSchema,
  metricIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";

function hyp(id: string): ParsedArtifact {
  return {
    kind: "hypothesis",
    filePath: `/doc/product/00-problem-hypotheses/0001-x.md`,
    relativePath: "product/00-problem-hypotheses/0001-x.md",
    frontmatter: {
      id: problemHypothesisIdSchema.parse(id),
      status: "proposed",
    },
    body: "",
  };
}

function met(id: string, hypothesisId: string): ParsedArtifact {
  return {
    kind: "metric",
    filePath: "/doc/product/01-metrics/0001-x.md",
    relativePath: "product/01-metrics/0001-x.md",
    frontmatter: {
      id: metricIdSchema.parse(id),
      status: "accepted",
      problem_hypothesis_id: problemHypothesisIdSchema.parse(hypothesisId),
    },
    body: "",
  };
}

function sol(id: string, metIds: string[]): ParsedArtifact {
  return {
    kind: "solution_hypothesis",
    filePath: "/doc/product/02-solution-hypotheses/0001-x.md",
    relativePath: "product/02-solution-hypotheses/0001-x.md",
    frontmatter: {
      id: solutionHypothesisIdSchema.parse(id),
      status: "proposed",
      metric_ids: metIds.map((m) => metricIdSchema.parse(m)),
    },
    body: "",
  };
}

describe("buildAdjacency", () => {
  it("links metric to hypothesis bidirectionally", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);
    const adj = buildAdjacency(index);

    expect(adj.get(metricIdSchema.parse("MET-0001"))).toContain(
      problemHypothesisIdSchema.parse("PROB-0001"),
    );
    expect(adj.get(problemHypothesisIdSchema.parse("PROB-0001"))).toContain(
      metricIdSchema.parse("MET-0001"),
    );
  });

  it("links solution hypothesis to its metrics", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const s = sol("SOL-0001", ["MET-0001"]);
    const index = buildIndex([h, m, s]);
    const adj = buildAdjacency(index);

    const solNeighbors = adj.get(solutionHypothesisIdSchema.parse("SOL-0001"));
    expect(solNeighbors).toContain(metricIdSchema.parse("MET-0001"));
  });

  it("reaches hypothesis from solution hypothesis at 2 hops via metric", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const s = sol("SOL-0001", ["MET-0001"]);
    const index = buildIndex([h, m, s]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([solutionHypothesisIdSchema.parse("SOL-0001")]), 2);
    expect(result.get(metricIdSchema.parse("MET-0001"))).toBe(1);
    expect(result.get(problemHypothesisIdSchema.parse("PROB-0001"))).toBe(2);
  });
});

describe("bfsNeighbors", () => {
  it("returns seed at hops=0", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([problemHypothesisIdSchema.parse("PROB-0001")]), 2);
    expect(result.get(problemHypothesisIdSchema.parse("PROB-0001"))).toBe(0);
  });

  it("reaches metric at hops=1 from hypothesis", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([problemHypothesisIdSchema.parse("PROB-0001")]), 2);
    expect(result.get(metricIdSchema.parse("MET-0001"))).toBe(1);
  });

  it("reaches sibling hypothesis at hops=4 via shared solution hypothesis", () => {
    const h1 = hyp("PROB-0001");
    const h2 = hyp("PROB-0002");
    const m1 = met("MET-0001", "PROB-0001");
    const m2 = met("MET-0002", "PROB-0002");
    const s = sol("SOL-0001", ["MET-0001", "MET-0002"]);
    const index = buildIndex([h1, h2, m1, m2, s]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([problemHypothesisIdSchema.parse("PROB-0001")]), 4);
    expect(result.get(problemHypothesisIdSchema.parse("PROB-0002"))).toBe(4);
  });

  it("does not exceed maxHops", () => {
    const h1 = hyp("PROB-0001");
    const h2 = hyp("PROB-0002");
    const m1 = met("MET-0001", "PROB-0001");
    const m2 = met("MET-0002", "PROB-0002");
    const s = sol("SOL-0001", ["MET-0001", "MET-0002"]);
    const index = buildIndex([h1, h2, m1, m2, s]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([problemHypothesisIdSchema.parse("PROB-0001")]), 1);
    expect(result.has(problemHypothesisIdSchema.parse("PROB-0002"))).toBe(false);
  });

  it("handles disconnected nodes", () => {
    const h1 = hyp("PROB-0001");
    const h2 = hyp("PROB-0002");
    const index = buildIndex([h1, h2]);
    const adj = buildAdjacency(index);

    const result = bfsNeighbors(adj, new Set([problemHypothesisIdSchema.parse("PROB-0001")]), 2);
    expect(result.has(problemHypothesisIdSchema.parse("PROB-0002"))).toBe(false);
  });
});
