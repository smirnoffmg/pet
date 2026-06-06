import { describe, expect, it } from "vitest";
import { deriveTitle } from "@/chat/derive-title.js";

describe("deriveTitle", () => {
  it("strips common filler words and title-cases the remainder", () => {
    expect(deriveTitle("I want to understand slow CI")).toBe("Understand Slow Ci");
  });

  it("title-cases a simple problem statement", () => {
    expect(deriveTitle("why do users churn")).toBe("Why Users Churn");
  });

  it("returns Untitled for an empty input", () => {
    expect(deriveTitle("")).toBe("Untitled");
  });

  it("returns Untitled for whitespace-only input", () => {
    expect(deriveTitle("   \t  ")).toBe("Untitled");
  });

  it("falls back to title-cased original input when every token is a filler word", () => {
    expect(deriveTitle("I want to be")).toBe("I Want To Be");
  });

  it("truncates the result to 80 characters at a word boundary", () => {
    const long =
      "users abandon onboarding when verification fails repeatedly because emails route to spam folders quietly";
    const result = deriveTitle(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith(" ")).toBe(false);
    expect(result.split(/\s+/).every((w) => w.length > 0)).toBe(true);
  });

  it("strips punctuation from individual tokens", () => {
    expect(deriveTitle("Why, exactly, do users churn?")).toBe("Why Exactly Users Churn");
  });

  it("preserves hyphens and apostrophes inside tokens", () => {
    expect(deriveTitle("understand low-touch user's churn")).toBe(
      "Understand Low-touch User's Churn",
    );
  });

  it("is case-insensitive when matching filler words", () => {
    expect(deriveTitle("I WANT TO understand churn")).toBe("Understand Churn");
  });
});
