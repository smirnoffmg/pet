const FILLER_WORDS: ReadonlySet<string> = new Set([
  "i",
  "want",
  "to",
  "a",
  "an",
  "the",
  "we",
  "our",
  "some",
  "do",
  "is",
  "are",
  "am",
  "be",
  "been",
  "would",
  "like",
  "need",
  "let",
  "me",
  "you",
  "us",
]);

const MAX_TITLE_LENGTH = 80;

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCasePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map(titleCaseWord)
    .join(" ");
}

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export function deriveTitle(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "Untitled";

  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9'-]/g, ""))
    .filter((token) => token.length > 0);

  const kept = tokens.filter((token) => !FILLER_WORDS.has(token.toLowerCase()));

  if (kept.length === 0) {
    const fallback = titleCasePhrase(trimmed.slice(0, MAX_TITLE_LENGTH));
    return truncateAtWordBoundary(fallback, MAX_TITLE_LENGTH);
  }

  const title = kept.map(titleCaseWord).join(" ");
  return truncateAtWordBoundary(title, MAX_TITLE_LENGTH);
}
