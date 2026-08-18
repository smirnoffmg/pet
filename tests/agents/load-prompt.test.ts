import { describe, expect, it } from "vitest";
import { loadPrompt, withTodayLine } from "@/agents/load-prompt.js";

describe("withTodayLine", () => {
  it("appends the current date so agents never guess dates", () => {
    const result = withTodayLine("Base prompt.", "2026-08-18");
    expect(result).toContain("Base prompt.");
    expect(result).toContain("Today's date is 2026-08-18.");
  });

  it("keeps the base prompt first", () => {
    const result = withTodayLine(loadPrompt("architect"), "2026-08-18");
    expect(result.indexOf("Architect")).toBeLessThan(result.indexOf("2026-08-18"));
  });
});
