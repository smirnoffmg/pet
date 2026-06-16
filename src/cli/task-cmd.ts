import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { validateRepo, formatReport } from "@/validators/index.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";

function currentCommitSha(repoRoot: string): string | undefined {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export async function runTaskDone(taskId: string): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  const scan = scanArtifacts(root);
  if (scan.isErr()) {
    console.error(scan.error.message);
    return 1;
  }

  const artifact = scan.value.find((a) => a.kind === "task" && a.frontmatter.id === taskId);
  if (!artifact) {
    console.error(`Task not found: ${taskId}`);
    return 1;
  }

  const fm = artifact.frontmatter as DevTaskFrontmatter;
  if (fm.status === "done") {
    console.log(`Task ${taskId} is already done.`);
    return 0;
  }

  const sourcePath = artifact.filePath;
  const archiveDir = path.join(path.dirname(sourcePath), "archive");
  const destPath = path.join(archiveDir, path.basename(sourcePath));
  if (fs.existsSync(destPath)) {
    console.error(`Archive destination already exists: ${destPath}`);
    return 1;
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const parsed = matter(raw);
  // gray-matter caches `data` by raw content string and only shallow-copies
  // on a cache hit, so mutating it in place would corrupt that cache entry
  // for any later parse of this same original text (e.g. on rollback below).
  const data = { ...(parsed.data as Record<string, unknown>) };
  data["status"] = "done";
  data["completed_at"] = new Date().toISOString();
  const sha = currentCommitSha(repoRoot);
  if (sha) data["commit_sha"] = sha;

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(sourcePath, matter.stringify(parsed.content, data), "utf8");
  fs.renameSync(sourcePath, destPath);

  const validation = validateRepo(root, repoRoot);
  if (validation.isErr()) {
    fs.renameSync(destPath, sourcePath);
    fs.writeFileSync(sourcePath, raw, "utf8");
    console.error(formatReport(validation.error));
    return 1;
  }

  console.log(`Marked ${taskId} as done and archived to ${path.relative(repoRoot, destPath)}.`);
  return 0;
}
