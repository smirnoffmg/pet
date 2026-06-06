import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

export function computeRepoHash(repoRoot: string): string {
  try {
    const out = execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return createHash("sha256").update(out.trim()).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
  }
}
