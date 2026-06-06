import { z } from "zod";
import { artifactIdSchema } from "./ids.js";

export const supersessionFields = {
  supersedes: artifactIdSchema.optional(),
  superseded_by: artifactIdSchema.optional(),
};

export function withSupersessionRefine<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): z.ZodEffects<z.ZodObject<T>> {
  return schema.superRefine((data, ctx) => {
    const record = data as Record<string, unknown>;
    const supersededBy = record["superseded_by"];
    const status = record["status"];
    if (supersededBy !== undefined && status !== "superseded") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "status must be superseded when superseded_by is set",
        path: ["status"],
      });
    }
  });
}
