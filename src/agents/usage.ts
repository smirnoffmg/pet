/** Extract cumulative token usage from a deepagents / LangGraph invoke result. */
export type TokenUsage = {
  /** Total prompt tokens — uncached + cache writes + cache reads. */
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Prompt tokens written to the cache this run (billed at a premium). */
  cacheCreationTokens: number;
  /** Prompt tokens served from the cache this run (billed at ~a tenth). */
  cacheReadTokens: number;
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
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

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

    // @langchain/anthropic folds cache tokens into input_tokens and reports the
    // split here, so the breakdown is a subset of inputTokens, never an addition.
    const details = usage["input_token_details"];
    if (details && typeof details === "object") {
      const d = details as Record<string, unknown>;
      cacheCreationTokens += numberField(d, ["cache_creation", "cache_creation_input_tokens"]);
      cacheReadTokens += numberField(d, ["cache_read", "cache_read_input_tokens"]);
    } else {
      // Raw Anthropic usage shape, where input_tokens excludes cached tokens.
      const creation = numberField(usage, ["cache_creation_input_tokens"]);
      const read = numberField(usage, ["cache_read_input_tokens"]);
      cacheCreationTokens += creation;
      cacheReadTokens += read;
      inputTokens += creation + read;
    }
  }

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
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

const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

/**
 * Cache reads bill at about a tenth of the input rate; cache writes carry a
 * premium — 1.25x for the 5-minute TTL the harness uses (`{type:"ephemeral"}`
 * with no explicit ttl). Charging every prompt token at the full input rate
 * overstates any run where the cache is doing its job.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Rough USD estimate for Sonnet-class models (display only). */
export function estimateUsdFromTokens(usage: TokenUsage): number {
  const cached = usage.cacheCreationTokens + usage.cacheReadTokens;
  // Defensive: a provider that reports cache tokens on top of input_tokens
  // rather than inside it would otherwise drive this negative.
  const uncachedTokens = Math.max(0, usage.inputTokens - cached);

  const uncachedUsd = (uncachedTokens / 1_000_000) * INPUT_USD_PER_MTOK;
  const readUsd = (usage.cacheReadTokens / 1_000_000) * INPUT_USD_PER_MTOK * CACHE_READ_MULTIPLIER;
  const writeUsd =
    (usage.cacheCreationTokens / 1_000_000) * INPUT_USD_PER_MTOK * CACHE_WRITE_MULTIPLIER;
  const outputUsd = (usage.outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;

  return uncachedUsd + readUsd + writeUsd + outputUsd;
}

/** Share of prompt tokens served from the cache, 0..1. */
export function cacheHitRate(usage: TokenUsage): number {
  if (usage.inputTokens === 0) return 0;
  return usage.cacheReadTokens / usage.inputTokens;
}
