export class FilenameError extends Error {
  override name = "FilenameError";

  constructor(
    public readonly filePath: string,
    detail: string,
  ) {
    super(`${filePath}: ${detail}`);
  }
}
