import { z } from "zod";
import { solutionHypothesisIdSchema, problemHypothesisIdSchema, metricIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const solutionHypothesisStatusSchema = z.enum(["proposed", "accepted", "rejected", "superseded"]);

export const solutionHypothesisFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: solutionHypothesisIdSchema,
    status: solutionHypothesisStatusSchema,
    problem_hypothesis_id: problemHypothesisIdSchema,
    target_metric_id: metricIdSchema,
    rejection_rationale: z.string().optional(),
    ...supersessionFields,
  }),
).superRefine((data, ctx) => {
  if (data.status === "rejected" && !data.rejection_rationale) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rejection_rationale is required when status is rejected",
      path: ["rejection_rationale"],
    });
  }
});

export type SolutionHypothesisFrontmatter = z.infer<typeof solutionHypothesisFrontmatterSchema>;
