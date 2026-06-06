export { parseArtifactFile, type ParsedArtifact } from "./parse.js";
export { scanArtifacts, buildIndex, type ArtifactIndex } from "./scan.js";
export { allocateNextId } from "./allocate.js";
export { writeArtifact } from "./write.js";
export { findRepoRoot, docRoot } from "./repo-root.js";
export {
  ARTIFACT_DIR_BY_KIND,
  ARTIFACT_SCAN_DIRS,
  ADR_DIR,
  dirForKind,
  kindFromRelativePath,
} from "./paths.js";
export { buildFilename, titleToSlug, numericSuffixFromFilename } from "./slug.js";
export { nextAdrNumber } from "./adr.js";
export { adrTemplate } from "./templates.js";
