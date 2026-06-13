export class McpConfigError extends Error {
  override name = "McpConfigError";
  constructor(message: string) {
    super(message);
  }
}
