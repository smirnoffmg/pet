import type { ArtifactKind } from "@/schemas/ids.js";
import { idPrefixForKind, numericSuffixFromId } from "@/schemas/ids.js";
import type { ParsedArtifact } from "./parse.js";

export function allocateNextId(kind: ArtifactKind, artifacts: ParsedArtifact[]): string {
  const prefix = idPrefixForKind(kind);
  let max = 0;
  for (const artifact of artifacts) {
    if (artifact.kind !== kind) {
      continue;
    }
    const suffix = numericSuffixFromId(artifact.frontmatter.id);
    if (suffix > max) {
      max = suffix;
    }
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}
