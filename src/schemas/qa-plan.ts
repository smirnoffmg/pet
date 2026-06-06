import { z } from "zod";
import { featureIdSchema, qaPlanIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const qaPlanStatusSchema = z.enum(["proposed", "accepted", "superseded"]);

export const qaPlanFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: qaPlanIdSchema,
    status: qaPlanStatusSchema,
    feature_id: featureIdSchema,
    ...supersessionFields,
  }),
);

export type QaPlanFrontmatter = z.infer<typeof qaPlanFrontmatterSchema>;
