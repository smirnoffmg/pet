import { describe, expect, it } from "vitest";
import { extractTokenUsage, estimateUsdFromTokens } from "@/agents/usage.js";

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
    });
    expect(estimateUsdFromTokens(usage!)).toBeGreaterThan(0);
  });
});
