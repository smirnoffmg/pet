export class ProviderConfigError extends Error {
  override name = "ProviderConfigError";

  constructor(message: string) {
    super(message);
  }
}
