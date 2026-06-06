import { z } from "zod";
import { featureIdSchema, taskIdSchema } from "./ids.js";

const taskStatusSchema = z.enum(["todo", "in_progress", "review", "done"]);

export const devTaskFrontmatterSchema = z.object({
  id: taskIdSchema,
  status: taskStatusSchema,
  feature_id: featureIdSchema,
  completed_at: z.string().datetime().optional(),
  pr_url: z.string().url().optional(),
  commit_sha: z.string().min(7).optional(),
});

export type DevTaskFrontmatter = z.infer<typeof devTaskFrontmatterSchema>;
