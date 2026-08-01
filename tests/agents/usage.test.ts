import { describe, expect, it } from "vitest";
import { cacheHitRate, extractTokenUsage, estimateUsdFromTokens } from "@/agents/usage.js";

describe("extractTokenUsage", () => {
  it("sums usage_metadata on messages", () => {
    const usage = extractTokenUsage({
      messages: [
        { usage_metadata: { input_tokens: 100, output_tokens: 50 } },
        { usage_metadata: { input_tokens: 200, output_tokens: 80 } },
      ],
    });
    expect(usage).toEqual({
      inputTokens: 300,
      outputTokens: 130,
      totalTokens: 430,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(estimateUsdFromTokens(usage!)).toBeGreaterThan(0);
  });

  it("reads the LangChain cache split, which is a subset of input_tokens", () => {
    // @langchain/anthropic sets input_tokens = uncached + creation + read.
    const usage = extractTokenUsage({
      messages: [
        {
          usage_metadata: {
            input_tokens: 10_000,
            output_tokens: 500,
            input_token_details: { cache_creation: 2_000, cache_read: 7_000 },
          },
        },
      ],
    });
    expect(usage).toEqual({
      inputTokens: 10_000,
      outputTokens: 500,
      totalTokens: 10_500,
      cacheCreationTokens: 2_000,
      cacheReadTokens: 7_000,
    });
  });

  it("adds the cache split to input when a provider reports the raw Anthropic shape", () => {
    // Raw Anthropic usage excludes cached tokens from input_tokens, so they must
    // be added in — otherwise the same run reports a smaller prompt than it sent.
    const usage = extractTokenUsage({
      messages: [
        {
          usage_metadata: {
            input_tokens: 1_000,
            output_tokens: 100,
            cache_creation_input_tokens: 2_000,
            cache_read_input_tokens: 7_000,
          },
        },
      ],
    });
    expect(usage?.inputTokens).toBe(10_000);
    expect(usage?.cacheCreationTokens).toBe(2_000);
    expect(usage?.cacheReadTokens).toBe(7_000);
  });
});

describe("estimateUsdFromTokens", () => {
  it("prices uncached, cache-read and cache-write tokens at their own rates", () => {
    const usage = {
      inputTokens: 10_000,
      outputTokens: 1_000,
      totalTokens: 11_000,
      cacheCreationTokens: 2_000,
      cacheReadTokens: 7_000,
    };

    // uncached 1_000 @ $3      = $0.003
    // read     7_000 @ $3×0.1  = $0.0021
    // write    2_000 @ $3×1.25 = $0.0075
    // output   1_000 @ $15     = $0.015
    expect(estimateUsdFromTokens(usage)).toBeCloseTo(0.0276, 6);
  });

  it("is cheaper than charging every prompt token the full input rate", () => {
    const cached = {
      inputTokens: 100_000,
      outputTokens: 3_000,
      totalTokens: 103_000,
      cacheCreationTokens: 10_000,
      cacheReadTokens: 80_000,
    };
    const flatRate = (100_000 / 1_000_000) * 3 + (3_000 / 1_000_000) * 15;

    expect(estimateUsdFromTokens(cached)).toBeLessThan(flatRate);
  });

  it("matches the old flat estimate when nothing was cached", () => {
    const uncached = {
      inputTokens: 100_000,
      outputTokens: 3_000,
      totalTokens: 103_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    const flatRate = (100_000 / 1_000_000) * 3 + (3_000 / 1_000_000) * 15;

    expect(estimateUsdFromTokens(uncached)).toBeCloseTo(flatRate, 10);
  });

  it("does not go negative if a provider reports more cached tokens than input", () => {
    const inconsistent = {
      inputTokens: 1_000,
      outputTokens: 0,
      totalTokens: 1_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 5_000,
    };
    expect(estimateUsdFromTokens(inconsistent)).toBeGreaterThanOrEqual(0);
  });
});

describe("cacheHitRate", () => {
  it("is the share of prompt tokens served from cache", () => {
    expect(
      cacheHitRate({
        inputTokens: 10_000,
        outputTokens: 0,
        totalTokens: 10_000,
        cacheCreationTokens: 1_000,
        cacheReadTokens: 8_000,
      }),
    ).toBeCloseTo(0.8, 10);
  });

  it("is zero rather than NaN on an empty run", () => {
    expect(
      cacheHitRate({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBe(0);
  });
});
