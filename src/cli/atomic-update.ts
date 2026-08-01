import fs from "node:fs";
import matter from "gray-matter";
import { err, ok, type Result } from "neverthrow";
import { validateRepo } from "@/validators/index.js";
import type { ValidationReport } from "@/validators/index.js";

/**
 * Applies a frontmatter patch, then revalidates the whole repository and
 * restores the original bytes if validation fails.
 */
export function atomicFrontmatterUpdate(
  filePath: string,
  patch: Record<string, unknown>,
  docRootPath: string,
  repoRoot: string,
): Result<void, ValidationReport> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  // gray-matter caches `data` by raw content string and only shallow-copies on a
  // cache hit, so mutating it in place would corrupt that cache entry for any
  // later parse of this same original text — including the rollback below.
  const data = { ...(parsed.data as Record<string, unknown>), ...patch };

  fs.writeFileSync(filePath, matter.stringify(parsed.content, data), "utf8");

  const validation = validateRepo(docRootPath, repoRoot);
  if (validation.isErr()) {
    fs.writeFileSync(filePath, raw, "utf8");
    return err(validation.error);
  }

  return ok(undefined);
}
