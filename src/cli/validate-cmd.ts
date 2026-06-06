import { validateRepo, formatReport } from "@/validators/index.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";

export function runValidate(options: { doc?: string }): number {
  const repoRoot = findRepoRoot();
  const root = options.doc ?? docRoot(repoRoot);
  const result = validateRepo(root, repoRoot);

  if (result.isOk()) {
    console.log("Validation passed.");
    return 0;
  }

  console.error(formatReport(result.error));
  return 1;
}
