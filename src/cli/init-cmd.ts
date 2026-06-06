import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";
import { createModel } from "@/llm/provider-factory.js";

const SYSTEM_PROMPT =
  "You are a technical analyst summarizing a software project for a product development assistant. Be concise and factual.";

const OUTPUT_PROMPT = `Produce a structured markdown summary with exactly these sections:

# Project Context

## Overview
[1–3 sentences: what does this project do and who uses it?]

## Tech Stack
[key languages, frameworks, build tools, test runner — bullet list]

## Project Structure
[key directories and their purpose — bullet list]

## Recent Activity
[what the last 20 commits suggest about active development areas — 2–4 sentences]

## Testing & CI
[test framework, CI setup, coverage hints — bullet list]`;

function collectRawFacts(repoRoot: string): string {
  const parts: string[] = [];

  try {
    const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
    const filtered = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
      .map((e) => `  ${e.isDirectory() ? "[dir] " : "[file]"} ${e.name}`);
    parts.push("## Top-level structure\n" + filtered.join("\n"));
  } catch {
    // non-fatal: continue without directory listing
  }

  const readmePath = path.join(repoRoot, "README.md");
  if (fs.existsSync(readmePath)) {
    const lines = fs.readFileSync(readmePath, "utf8").split("\n").slice(0, 100).join("\n");
    parts.push("## README.md (first 100 lines)\n" + lines);
  }

  for (const manifest of ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]) {
    const manifestPath = path.join(repoRoot, manifest);
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, "utf8").split("\n").slice(0, 100).join("\n");
      parts.push(`## ${manifest} (first 100 lines)\n${content}`);
      break;
    }
  }

  try {
    const log = execSync("git log --oneline -20", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    parts.push("## Recent git log (last 20 commits)\n" + log);
  } catch {
    // not a git repo or no commits — skip
  }

  const infraPresent: string[] = [];
  const infraChecks: [string, string][] = [
    [".github/workflows", "GitHub Actions CI"],
    [".circleci", "CircleCI"],
    [".travis.yml", "Travis CI"],
    ["Makefile", "Makefile"],
    ["Dockerfile", "Docker"],
    ["vitest.config.ts", "Vitest"],
    ["jest.config.js", "Jest"],
    ["jest.config.ts", "Jest"],
    ["tests", "tests/ directory"],
    ["test", "test/ directory"],
    ["spec", "spec/ directory"],
    ["__tests__", "__tests__/ directory"],
  ];
  for (const [p, label] of infraChecks) {
    if (fs.existsSync(path.join(repoRoot, p))) {
      infraPresent.push(label);
    }
  }
  if (infraPresent.length > 0) {
    parts.push("## CI / Testing infrastructure\n" + infraPresent.join(", "));
  }

  return parts.join("\n\n");
}

export async function runInit(): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  console.log("Scanning project...");
  const rawFacts = collectRawFacts(repoRoot);

  console.log("Synthesizing project context with LLM...");
  let summary: string;
  try {
    const model = await createModel();
    const response = await model.invoke([
      ["system", SYSTEM_PROMPT],
      ["human", `${OUTPUT_PROMPT}\n\n---\nRaw project facts:\n\n${rawFacts}`],
    ]);
    const content = response.content;
    summary = typeof content === "string" ? content : JSON.stringify(content);
  } catch (e) {
    console.error(`LLM call failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const contextDir = path.join(root, "product", "context");
  const outputPath = path.join(contextDir, "project.md");

  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(outputPath, summary, "utf8");

  console.log(`Project context written to ${path.relative(repoRoot, outputPath)}`);
  return 0;
}
