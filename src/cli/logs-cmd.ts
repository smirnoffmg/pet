import fs from "node:fs";
import path from "node:path";
import { loadConfig, petDataDir } from "@/config.js";
import { computeRepoHash } from "@/store/repo-hash.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";

export type LogsOptions = {
  session?: string;
  tail?: number;
};

function readTail(filePath: string, lines: number): string {
  const content = fs.readFileSync(filePath, "utf8");
  const all = content.split("\n").filter((l) => l.length > 0);
  return all.slice(-lines).join("\n");
}

function latestSessionDir(sessionsRoot: string): string | null {
  if (!fs.existsSync(sessionsRoot)) {
    return null;
  }
  const entries = fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = path.join(sessionsRoot, e.name);
      return { name: e.name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  const first = entries[0];
  return first ? path.join(sessionsRoot, first.name) : null;
}

export function runLogs(options: LogsOptions): number {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);
  const config = loadConfig();
  const repoHash = computeRepoHash(repoRoot);
  const tail = options.tail ?? 50;

  const orchestrationPath = path.join(root, "product/orchestration/decisions.md");
  if (fs.existsSync(orchestrationPath)) {
    console.log("=== doc/product/orchestration/decisions.md ===\n");
    const content = fs.readFileSync(orchestrationPath, "utf8").trim();
    console.log(content.length > 0 ? content : "(empty)");
    console.log();
  } else {
    console.log("(no orchestration log yet)\n");
  }

  const sessionsRoot = path.join(petDataDir(repoHash), "sessions");
  const sessionPath = options.session
    ? path.join(sessionsRoot, options.session)
    : latestSessionDir(sessionsRoot);

  if (!sessionPath || !fs.existsSync(sessionPath)) {
    console.log(`No session logs under ~/.local/share/pet/${repoHash}/sessions/`);
    console.log("Run `pet deliver` or `pet discover` to create a session.");
    return 0;
  }

  const runLog = path.join(sessionPath, "run.log");
  console.log(`=== session ${path.basename(sessionPath)} ===`);
  console.log(`Path: ${sessionPath}`);
  if (config.mockAgents) {
    console.log("(PET_MOCK_AGENTS=1 was used for recent runs if applicable)");
  }
  console.log();

  if (!fs.existsSync(runLog)) {
    console.log("(no run.log in this session — re-run deliver/discover after upgrading pet)");
    return 0;
  }

  console.log(readTail(runLog, tail));
  return 0;
}
