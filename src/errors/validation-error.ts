import type { ZodIssue } from "zod";

export class ValidationError extends Error {
  override name = "ValidationError";

  constructor(
    public readonly artifactId: string,
    public readonly issues: ZodIssue[],
  ) {
    super(`Validation failed for ${artifactId}`);
  }
}
