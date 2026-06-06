export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildFilename(numericSuffix: number, title: string): string {
  const padded = String(numericSuffix).padStart(4, "0");
  const slug = titleToSlug(title);
  return `${padded}-${slug}.md`;
}

export function numericSuffixFromFilename(filename: string): number | null {
  const match = /^(\d{4})-/.exec(filename);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}
