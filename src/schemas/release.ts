import { z } from "zod";
import { featureIdSchema, releaseIdSchema } from "./ids.js";
import { supersessionFields, withSupersessionRefine } from "./base.js";

const releaseStatusSchema = z.enum(["proposed", "accepted", "shipped", "superseded"]);

export const releaseFrontmatterSchema = withSupersessionRefine(
  z.object({
    id: releaseIdSchema,
    status: releaseStatusSchema,
    feature_ids: z.array(featureIdSchema).min(1),
    ...supersessionFields,
  }),
);

export type ReleaseFrontmatter = z.infer<typeof releaseFrontmatterSchema>;
