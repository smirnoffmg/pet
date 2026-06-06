import fs from "node:fs";
import matter from "gray-matter";
import { err, ok, type Result } from "neverthrow";
import type { ArtifactKind } from "@/schemas/ids.js";
import type { ArtifactFrontmatter } from "@/schemas/index.js";
import { parseFrontmatterForKind } from "@/schemas/index.js";
import { kindFromRelativePath } from "./paths.js";

export type ParsedArtifact = {
  kind: ArtifactKind;
  filePath: string;
  relativePath: string;
  frontmatter: ArtifactFrontmatter;
  body: string;
};

export function parseArtifactFile(
  docRoot: string,
  filePath: string,
): Result<ParsedArtifact, { filePath: string; message: string }> {
  const relativePath = filePath.startsWith(docRoot) ? filePath.slice(docRoot.length + 1) : filePath;
  const kind = kindFromRelativePath(relativePath);
  if (!kind) {
    return err({
      filePath,
      message: `Cannot determine artifact kind from path: ${relativePath}`,
    });
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ filePath, message });
  }

  const { data, content } = matter(raw);
  const parsed = parseFrontmatterForKind(kind, data);
  if (!parsed.success) {
    const id =
      typeof data === "object" && data !== null && "id" in data
        ? String((data as { id: unknown }).id)
        : filePath;
    return err({
      filePath,
      message: `Schema validation failed for ${id}: ${parsed.error.message}`,
    });
  }

  return ok({
    kind,
    filePath,
    relativePath,
    frontmatter: parsed.data,
    body: content,
  });
}
