import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { err, ok, type Result } from "neverthrow";
import type { ArtifactKind } from "@/schemas/ids.js";
import { numericSuffixFromId } from "@/schemas/ids.js";
import type { ArtifactFrontmatter } from "@/schemas/index.js";
import { dirForKind } from "./paths.js";
import { buildFilename } from "./slug.js";
import { bodyTemplateForKind } from "./templates.js";

export function writeArtifact(
  docRoot: string,
  kind: ArtifactKind,
  frontmatter: ArtifactFrontmatter,
  title: string,
  body?: string,
): Result<string, { message: string }> {
  const dir = dirForKind(docRoot, kind);
  fs.mkdirSync(dir, { recursive: true });

  const suffix = numericSuffixFromId(frontmatter.id);
  const filename = buildFilename(suffix, title);
  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    return err({ message: `File already exists: ${filePath}` });
  }

  const content = matter.stringify(body ?? bodyTemplateForKind(kind, title), frontmatter);
  fs.writeFileSync(filePath, content, "utf8");

  return ok(filePath);
}
