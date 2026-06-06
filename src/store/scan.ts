import fs from "node:fs";
import path from "node:path";
import { err, ok, type Result } from "neverthrow";
import type { ArtifactId } from "@/schemas/ids.js";
import { ARTIFACT_SCAN_DIRS } from "./paths.js";
import { parseArtifactFile, type ParsedArtifact } from "./parse.js";

export type ArtifactIndex = Map<ArtifactId, ParsedArtifact>;

export function scanArtifacts(docRoot: string): Result<ParsedArtifact[], { message: string }> {
  const artifacts: ParsedArtifact[] = [];
  const errors: string[] = [];

  for (const dir of ARTIFACT_SCAN_DIRS) {
    const fullDir = path.join(docRoot, dir);
    if (!fs.existsSync(fullDir)) {
      continue;
    }
    walkMarkdown(fullDir, (filePath) => {
      const result = parseArtifactFile(docRoot, filePath);
      if (result.isErr()) {
        errors.push(`${result.error.filePath}: ${result.error.message}`);
        return;
      }
      artifacts.push(result.value);
    });
  }

  if (errors.length > 0) {
    return err({ message: errors.join("\n") });
  }

  return ok(artifacts);
}

export function buildIndex(artifacts: ParsedArtifact[]): ArtifactIndex {
  const index = new Map<ArtifactId, ParsedArtifact>();
  for (const artifact of artifacts) {
    index.set(artifact.frontmatter.id as ArtifactId, artifact);
  }
  return index;
}

function walkMarkdown(dir: string, onFile: (filePath: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(fullPath, onFile);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      onFile(fullPath);
    }
  }
}
