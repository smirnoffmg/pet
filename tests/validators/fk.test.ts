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
  it("detects dangling hypothesis target_metric_ids entry", () => {
    const hypothesis: ParsedArtifact = {
      kind: "hypothesis",
      filePath: "/doc/product/00-problem-hypotheses/0001-x.md",
      relativePath: "product/00-problem-hypotheses/0001-x.md",
      frontmatter: {
        id: problemHypothesisIdSchema.parse("PROB-0001"),
        status: "proposed",
        target_metric_ids: [metricIdSchema.parse("MET-9999")],
      },
      body: "",
    };
    const index = buildIndex([]);
    const report = validateForeignKeys([hypothesis], index);
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe("fk");
  });

  it("detects dangling solution_hypothesis target_metric_id", () => {
    const sol: ParsedArtifact = {
      kind: "solution_hypothesis",
      filePath: "/doc/product/02-solution-hypotheses/0001-x.md",
      relativePath: "product/02-solution-hypotheses/0001-x.md",
      frontmatter: {
        id: solutionHypothesisIdSchema.parse("SOL-0001"),
        status: "proposed",
        problem_hypothesis_id: problemHypothesisIdSchema.parse("PROB-0001"),
        target_metric_id: metricIdSchema.parse("MET-9999"),
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
        target_metric_ids: [],
      },
      body: "",
    };
    const index = buildIndex([hyp]);
    const report = validateForeignKeys([sol], index);
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe("fk");
    expect(report.issues[0]?.message).toMatch(/target_metric_id/);
  });
});
