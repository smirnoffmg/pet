import { z } from "zod";
import { featureIdSchema, solutionHypothesisIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const featureStatusSchema = z.enum(["proposed", "accepted", "released", "superseded"]);

const architecturalReviewStatusSchema = z.enum(["pending", "cleared", "blocked"]);

export const featureFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: featureIdSchema,
    status: featureStatusSchema,
    solution_hypothesis_id: solutionHypothesisIdSchema.optional(),
    architectural_review_status: architecturalReviewStatusSchema.optional(),
    ...supersessionFields,
  }),
).refine((d) => d.status === "superseded" || d.solution_hypothesis_id != null, {
  message: "solution_hypothesis_id is required for non-superseded features",
});

export type FeatureFrontmatter = z.infer<typeof featureFrontmatterSchema>;
