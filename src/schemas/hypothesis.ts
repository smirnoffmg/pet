import { z } from "zod";
import { problemHypothesisIdSchema } from "./ids.js";
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
    ...supersessionFields,
  }),
);

export type HypothesisFrontmatter = z.infer<typeof hypothesisFrontmatterSchema>;
