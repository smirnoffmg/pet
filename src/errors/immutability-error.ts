export class ImmutabilityError extends Error {
  override name = "ImmutabilityError";

  constructor(
    public readonly artifactId: string,
    detail: string,
  ) {
    super(`${artifactId}: ${detail}`);
  }
}
