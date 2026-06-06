/** Extract cumulative token usage from a deepagents / LangGraph invoke result. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function extractTokenUsage(result: unknown): TokenUsage | null {
  if (typeof result !== "object" || result === null || !("messages" in result)) {
    return null;
  }
  const messages = (result as { messages: unknown }).messages;
  if (!Array.isArray(messages)) {
    return null;
  }

  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      continue;
    }
    const meta =
      "usage_metadata" in message
        ? (message as { usage_metadata?: unknown }).usage_metadata
        : "response_metadata" in message
          ? (message as { response_metadata?: { usage?: unknown } }).response_metadata?.usage
          : undefined;

    if (!meta || typeof meta !== "object") {
      continue;
    }

    const usage = meta as Record<string, unknown>;
    inputTokens += numberField(usage, ["input_tokens", "inputTokens", "prompt_tokens"]);
    outputTokens += numberField(usage, ["output_tokens", "outputTokens", "completion_tokens"]);
  }

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function numberField(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
  }
  return 0;
}

/** Rough USD estimate for Sonnet-class models (display only). */
export function estimateUsdFromTokens(usage: TokenUsage): number {
  const inputUsd = (usage.inputTokens / 1_000_000) * 3;
  const outputUsd = (usage.outputTokens / 1_000_000) * 15;
  return inputUsd + outputUsd;
}
