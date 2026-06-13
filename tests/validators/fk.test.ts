import { describe, expect, it } from "vitest";
import { validateForeignKeys } from "@/validators/fk.js";
import { buildIndex } from "@/store/scan.js";
import type { ParsedArtifact } from "@/store/parse.js";
import {
  problemHypothesisIdSchema,
  metricIdSchema,
  solutionHypothesisIdSchema,
} from "@/schemas/ids.js";

describe("validateForeignKeys", () => {
  it("detects dangling metric problem_hypothesis_id", () => {
    const metric: ParsedArtifact = {
      kind: "metric",
      filePath: "/doc/product/01-metrics/0001-x.md",
      relativePath: "product/01-metrics/0001-x.md",
      frontmatter: {
        id: metricIdSchema.parse("MET-0001"),
        status: "proposed",
        problem_hypothesis_id: problemHypothesisIdSchema.parse("PROB-9999"),
      },
      body: "",
    };
    const index = buildIndex([]);
    const report = validateForeignKeys([metric], index);
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe("fk");
    expect(report.issues[0]?.message).toMatch(/problem_hypothesis_id/);
  });

  it("detects dangling solution_hypothesis metric_ids entry", () => {
    const metric: ParsedArtifact = {
      kind: "metric",
      filePath: "/doc/product/01-metrics/0001-x.md",
      relativePath: "product/01-metrics/0001-x.md",
      frontmatter: {
        id: metricIdSchema.parse("MET-0001"),
        status: "proposed",
        problem_hypothesis_id: problemHypothesisIdSchema.parse("PROB-0001"),
      },
      body: "",
    };
    const hyp: ParsedArtifact = {
      kind: "hypothesis",
      filePath: "/doc/product/00-problem-hypotheses/0001-h.md",
      relativePath: "product/00-problem-hypotheses/0001-h.md",
      frontmatter: {
        id: problemHypothesisIdSchema.parse("PROB-0001"),
        status: "accepted",
      },
      body: "",
    };
    const sol: ParsedArtifact = {
      kind: "solution_hypothesis",
      filePath: "/doc/product/02-solution-hypotheses/0001-x.md",
      relativePath: "product/02-solution-hypotheses/0001-x.md",
      frontmatter: {
        id: solutionHypothesisIdSchema.parse("SOL-0001"),
        status: "proposed",
        metric_ids: [metricIdSchema.parse("MET-9999")],
      },
      body: "",
    };
    const index = buildIndex([hyp, metric]);
    const report = validateForeignKeys([sol], index);
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe("fk");
    expect(report.issues[0]?.message).toMatch(/metric_ids/);
  });
});
