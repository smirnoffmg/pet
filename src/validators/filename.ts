import path from "node:path";
import { numericSuffixFromFilename } from "@/store/slug.js";
import { numericSuffixFromId } from "@/schemas/ids.js";
import type { ParsedArtifact } from "@/store/parse.js";
import { issue, type ValidationReport } from "./report.js";

const FILENAME_PATTERN = /^\d{4}-[a-z0-9-]+\.md$/;

export function validateFilenames(artifacts: ParsedArtifact[]): ValidationReport {
  const issues = [];

  for (const artifact of artifacts) {
    const basename = path.basename(artifact.filePath);
    if (!FILENAME_PATTERN.test(basename)) {
      issues.push(
        issue("filename", `Filename must match NNNN-kebab-case-title.md, got ${basename}`, {
          filePath: artifact.filePath,
          artifactId: artifact.frontmatter.id,
        }),
      );
      continue;
    }

    const fileNum = numericSuffixFromFilename(basename);
    const idNumResult = numericSuffixFromId(artifact.frontmatter.id);
    const idNum = idNumResult.isOk() ? idNumResult.value : null;
    if (fileNum !== idNum) {
      issues.push(
        issue(
          "filename",
          `Filename prefix ${String(fileNum).padStart(4, "0")} does not match id suffix ${String(idNum).padStart(4, "0")}`,
          { filePath: artifact.filePath, artifactId: artifact.frontmatter.id },
        ),
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
