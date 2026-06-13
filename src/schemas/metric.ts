import { z } from "zod";
import { metricIdSchema, problemHypothesisIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const metricStatusSchema = z.enum(["proposed", "accepted", "superseded"]);

export const targetMetricFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: metricIdSchema,
    status: metricStatusSchema,
    problem_hypothesis_id: problemHypothesisIdSchema,
    ...supersessionFields,
  }),
);

export type TargetMetricFrontmatter = z.infer<typeof targetMetricFrontmatterSchema>;
