import { describe, expect, it } from "vitest";
import { retrieve } from "@/retrieval/retrieve.js";
import { buildIndex } from "@/store/scan.js";
import type { ParsedArtifact } from "@/store/parse.js";
import {
  problemHypothesisIdSchema,
  metricIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";

function hyp(id: string, status: string = "proposed"): ParsedArtifact {
  return {
    kind: "hypothesis",
    filePath: `/doc/product/00-problem-hypotheses/${id}.md`,
    relativePath: `product/00-problem-hypotheses/${id}.md`,
    frontmatter: {
      id: problemHypothesisIdSchema.parse(id),
      status: status as "proposed" | "accepted" | "validated" | "invalidated" | "superseded",
    },
    body: `# ${id}\n\n## Evidence\n\n`,
  };
}

function met(id: string, hypothesisId: string): ParsedArtifact {
  return {
    kind: "metric",
    filePath: `/doc/product/01-metrics/${id}.md`,
    relativePath: `product/01-metrics/${id}.md`,
    frontmatter: {
      id: metricIdSchema.parse(id),
      status: "accepted" as const,
      problem_hypothesis_id: problemHypothesisIdSchema.parse(hypothesisId),
    },
    body: `# ${id}\n`,
  };
}

function sol(id: string, metIds: string[]): ParsedArtifact {
  return {
    kind: "solution_hypothesis",
    filePath: `/doc/product/02-solution-hypotheses/${id}.md`,
    relativePath: `product/02-solution-hypotheses/${id}.md`,
    frontmatter: {
      id: solutionHypothesisIdSchema.parse(id),
      status: "proposed" as const,
      metric_ids: metIds.map((m) => metricIdSchema.parse(m)),
    },
    body: `# ${id}\n`,
  };
}

describe("retrieve", () => {
  it("returns all artifacts when no seeds given", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);

    const result = retrieve(index, {});
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(2);
  });

  it("excludes superseded artifacts by default", () => {
    const active = hyp("PROB-0001");
    const dead = hyp("PROB-0002", "superseded");
    const index = buildIndex([active, dead]);

    const result = retrieve(index, {});
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.artifact.frontmatter.id).toBe("PROB-0001");
  });

  it("includes superseded when excludeSuperseded=false", () => {
    const active = hyp("PROB-0001");
    const dead = hyp("PROB-0002", "superseded");
    const index = buildIndex([active, dead]);

    const result = retrieve(index, { excludeSuperseded: false });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(2);
  });

  it("scores seed at 1.0 and 1-hop neighbor at 0.6", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);

    const result = retrieve(index, { seedIds: [problemHypothesisIdSchema.parse("PROB-0001")] });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const byId = new Map(result.value.items.map((i) => [String(i.artifact.frontmatter.id), i]));
    expect(byId.get("PROB-0001")?.score).toBe(1.0);
    expect(byId.get("MET-0001")?.score).toBe(0.6);
  });

  it("scores solution hypothesis at 0.3 (2 hops via metric from hypothesis)", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const s = sol("SOL-0001", ["MET-0001"]);
    const index = buildIndex([h, m, s]);

    const result = retrieve(index, { seedIds: [problemHypothesisIdSchema.parse("PROB-0001")] });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const byId = new Map(result.value.items.map((i) => [String(i.artifact.frontmatter.id), i]));
    expect(byId.get("SOL-0001")?.score).toBe(0.3);
  });

  it("filters by kind", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const index = buildIndex([h, m]);

    const result = retrieve(index, {
      seedIds: [problemHypothesisIdSchema.parse("PROB-0001")],
      kinds: ["metric"],
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.artifact.kind).toBe("metric");
  });

  it("respects limit", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const s = sol("SOL-0001", ["MET-0001"]);
    const index = buildIndex([h, m, s]);

    const result = retrieve(index, {
      seedIds: [problemHypothesisIdSchema.parse("PROB-0001")],
      limit: 2,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(2);
  });

  it("returns items sorted by score descending", () => {
    const h = hyp("PROB-0001");
    const m = met("MET-0001", "PROB-0001");
    const s = sol("SOL-0001", ["MET-0001"]);
    const index = buildIndex([h, m, s]);

    const result = retrieve(index, { seedIds: [problemHypothesisIdSchema.parse("PROB-0001")] });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const scores = result.value.items.map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
