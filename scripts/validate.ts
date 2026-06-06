import { validateRepo, formatReport } from "../src/validators/index.js";
import { docRoot, findRepoRoot } from "../src/store/repo-root.js";

const repoRoot = findRepoRoot();
const root = docRoot(repoRoot);
const result = validateRepo(root, repoRoot);

if (result.isOk()) {
  console.log("Validation passed.");
  process.exit(0);
}

console.error(formatReport(result.error));
process.exit(1);
