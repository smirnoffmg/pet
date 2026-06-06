import { z } from "zod";
import { problemHypothesisIdSchema, metricIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const hypothesisStatusSchema = z.enum([
  "proposed",
  "accepted",
  "validated",
  "invalidated",
  "superseded",
]);

export const hypothesisFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: problemHypothesisIdSchema,
    status: hypothesisStatusSchema,
    target_metric_ids: z.array(metricIdSchema),
    ...supersessionFields,
  }),
);

export type HypothesisFrontmatter = z.infer<typeof hypothesisFrontmatterSchema>;
