export class FkError extends Error {
  override name = "FkError";

  constructor(
    public readonly artifactId: string,
    public readonly field: string,
    public readonly referencedId: string,
  ) {
    super(`${artifactId}: ${field} references missing artifact ${referencedId}`);
  }
}
