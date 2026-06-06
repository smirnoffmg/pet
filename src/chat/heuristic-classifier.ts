export type Intent = "explore-problem" | "design-solution" | "status" | "ambiguous";

const STATUS_PHRASES: readonly string[] = ["what's pending", "what is pending", "next step"];

const STATUS_WORDS: readonly string[] = ["status"];

const EXPLORE_WORDS: readonly string[] = [
  "why",
  "problem",
  "understand",
  "explore",
  "research",
  "churn",
];

const DESIGN_WORDS: readonly string[] = [
  "build",
  "implement",
  "ship",
  "feature",
  "design",
  "solution",
];

function containsWholeWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function containsAnyPhrase(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => haystack.includes(phrase));
}

function containsAnyWord(haystack: string, words: readonly string[]): boolean {
  return words.some((word) => containsWholeWord(haystack, word));
}

function emitDebug(input: string, intent: Intent): void {
  if (process.env["PET_DEBUG"] !== "1") {
    return;
  }
  process.stderr.write(`[pet:chat:classifier] ${JSON.stringify({ input, intent })}\n`);
}

export function classifyIntent(input: string): Intent {
  const lowered = input.toLowerCase();

  let intent: Intent;
  if (containsAnyPhrase(lowered, STATUS_PHRASES) || containsAnyWord(lowered, STATUS_WORDS)) {
    intent = "status";
  } else if (containsAnyWord(lowered, EXPLORE_WORDS)) {
    intent = "explore-problem";
  } else if (containsAnyWord(lowered, DESIGN_WORDS)) {
    intent = "design-solution";
  } else {
    intent = "ambiguous";
  }

  emitDebug(input, intent);
  return intent;
}
