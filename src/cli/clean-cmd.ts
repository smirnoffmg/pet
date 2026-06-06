import fs from "node:fs";
import { petDataDir } from "@/config.js";
import { findRepoRoot } from "@/store/repo-root.js";
import { computeRepoHash } from "@/store/repo-hash.js";

export function runClean(): number {
  const repoRoot = findRepoRoot();
  const dataDir = petDataDir(computeRepoHash(repoRoot));
  if (!fs.existsSync(dataDir)) {
    console.log("No session data to clean.");
    return 0;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`Removed ${dataDir}`);
  return 0;
}
