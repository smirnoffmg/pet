import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function findRepoRoot(startDir: string = process.cwd()): string {
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    let dir = startDir;
    while (true) {
      if (fs.existsSync(path.join(dir, "doc"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        return startDir;
      }
      dir = parent;
    }
  }
}

export function docRoot(repoRoot: string): string {
  return path.join(repoRoot, "doc");
}

export function readGitBranch(repoRoot: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "(no branch)";
  }
}
