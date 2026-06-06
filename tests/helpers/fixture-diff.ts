import fs from "node:fs";
import path from "node:path";

/** Relative path → file contents snapshot of a directory tree. */
export type FixtureSnapshot = Map<string, string>;

export interface AssertFixtureDiffOptions {
  snapshot: FixtureSnapshot;
  root: string;
  /** Relative path, e.g. "hypotheses/0001-hyp-proposed.md". */
  targetHypothesisPath: string;
  expectEvidenceChanged: boolean;
  /**
   * Relative paths to exclude from both the "other files unchanged" and
   * "no new files" checks. Use for infrastructure files written by the CLI
   * that are not part of the subagent's output (e.g. "orchestration/decisions.md").
   */
  excludedPaths?: string[];
}

/** Recursively reads every file under `root`. Synchronous. */
export function snapshotFixture(root: string): FixtureSnapshot {
  const snap: FixtureSnapshot = new Map();
  walkDir(root, root, snap);
  return snap;
}

/**
 * Asserts that every file under `root` is byte-identical to `snapshot` and
 * that no new files were created. Throws a plain Error listing violations.
 */
export function assertNoChange(snapshot: FixtureSnapshot, root: string): void {
  const current = snapshotFixture(root);
  const errors: string[] = [];

  for (const [rel, content] of snapshot) {
    const curr = current.get(rel);
    if (curr === undefined) {
      errors.push(`file deleted: ${rel}`);
    } else if (curr !== content) {
      errors.push(`file changed: ${rel}`);
    }
  }

  for (const rel of current.keys()) {
    if (!snapshot.has(rel)) {
      errors.push(`new file created: ${rel}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`assertNoChange failed:\n${errors.join("\n")}`);
  }
}

/**
 * Asserts correctness constraints on how an agent mutated a fixture directory.
 *
 * When `expectEvidenceChanged` is false: delegates to `assertNoChange` (gate-abort).
 * When `expectEvidenceChanged` is true (happy-path):
 *   - The `## Evidence` section body in `targetHypothesisPath` must have changed.
 *   - All other sections and frontmatter in `targetHypothesisPath` must be identical.
 *   - All files other than `targetHypothesisPath` must be identical.
 *   - No new files may be created outside `targetHypothesisPath`.
 *
 * Throws a plain Error listing violated invariants.
 */
export function assertFixtureDiff(options: AssertFixtureDiffOptions): void {
  const { snapshot, root, targetHypothesisPath, expectEvidenceChanged, excludedPaths } = options;
  const excluded = new Set(excludedPaths ?? []);

  if (!expectEvidenceChanged) {
    assertNoChange(snapshot, root);
    return;
  }

  const current = snapshotFixture(root);
  const errors: string[] = [];

  // Check no new files outside target (ignoring excluded paths)
  for (const rel of current.keys()) {
    if (excluded.has(rel)) continue;
    if (!snapshot.has(rel) && rel !== targetHypothesisPath) {
      errors.push(`side-effect: new file created: ${rel}`);
    }
  }

  // Check all non-target files are byte-identical (ignoring excluded paths)
  for (const [rel, content] of snapshot) {
    if (excluded.has(rel)) continue;
    if (rel === targetHypothesisPath) continue;
    const curr = current.get(rel);
    if (curr === undefined) {
      errors.push(`file deleted: ${rel}`);
    } else if (curr !== content) {
      errors.push(`side-effect: ${rel} was modified`);
    }
  }

  // Check target file section-level constraints
  const snapTarget = snapshot.get(targetHypothesisPath);
  const currTarget = current.get(targetHypothesisPath);

  if (snapTarget === undefined) {
    errors.push(`target file not in snapshot: ${targetHypothesisPath}`);
  } else if (currTarget === undefined) {
    errors.push(`target file deleted: ${targetHypothesisPath}`);
  } else {
    const snapSections = parseSections(snapTarget);
    const currSections = parseSections(currTarget);

    // Evidence body must differ
    const snapEvBody = sectionBody(snapSections.get("## Evidence") ?? "");
    const currEvBody = sectionBody(currSections.get("## Evidence") ?? "");
    if (snapEvBody === currEvBody) {
      errors.push(`Evidence section was not changed in ${targetHypothesisPath}`);
    }

    // All other sections must be byte-identical
    for (const [key, snapText] of snapSections) {
      if (key === "## Evidence") continue;
      const currText = currSections.get(key);
      if (currText === undefined) {
        errors.push(`scope creep: ${key} section was removed`);
      } else if (currText !== snapText) {
        errors.push(`scope creep: ${key} was modified`);
      }
    }

    // No new sections added
    for (const key of currSections.keys()) {
      if (!snapSections.has(key)) {
        errors.push(`scope creep: new section ${key} was added`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`assertFixtureDiff failed:\n${errors.join("\n")}`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function walkDir(root: string, dir: string, out: FixtureSnapshot): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(root, full, out);
    } else if (entry.isFile()) {
      out.set(path.relative(root, full), fs.readFileSync(full, "utf8"));
    }
  }
}

/**
 * Splits a markdown file into named sections.
 *
 * Keys:
 *   "__frontmatter__" → everything between the opening and closing `---` fences (inclusive)
 *   "__pre_heading__" → text between frontmatter and the first `##` heading (if any)
 *   "## Heading"      → full section text (heading line + body)
 */
function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();

  // Extract frontmatter block
  const fmMatch = /^(---\n[\s\S]*?\n---\n?)/.exec(content);
  let rest = content;
  if (fmMatch?.[1] !== undefined) {
    sections.set("__frontmatter__", fmMatch[1]);
    rest = content.slice(fmMatch[1].length);
  }

  // Split remaining body on \n## boundaries (lookahead preserves the ## delimiter)
  const parts = rest.split(/\n(?=## )/);
  for (const part of parts) {
    if (!part.trim()) continue;
    if (part.trimStart().startsWith("## ")) {
      const heading = part.trimStart().split("\n")[0] ?? "";
      sections.set(heading.trim(), part);
    } else if (part.trim()) {
      sections.set("__pre_heading__", part);
    }
  }

  return sections;
}

/** Returns everything after the first newline in a section text (the body, excluding the heading). */
function sectionBody(sectionText: string): string {
  const idx = sectionText.indexOf("\n");
  return idx === -1 ? "" : sectionText.slice(idx);
}
