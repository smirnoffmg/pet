import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "@/store/repo-root.js";

export type PromptRole =
  | "architect"
  | "techlead"
  | "analyst"
  | "researcher"
  | "solution_designer"
  | "designer"
  | "designer_enrich"
  | "dev"
  | "qa"
  | "devops"
  | "orchestrator";

const PROMPT_FILES: Record<PromptRole, string> = {
  architect: "architect.md",
  techlead: "techlead.md",
  analyst: "analyst.md",
  researcher: "researcher.md",
  solution_designer: "solution-designer.md",
  designer: "designer-discovery.md",
  designer_enrich: "designer-enrich.md",
  dev: "dev.md",
  qa: "qa.md",
  devops: "devops.md",
  orchestrator: "orchestrator.md",
};

function resolvePromptsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "prompts"),
    path.join(moduleDir, "..", "prompts"),
    path.join(findRepoRoot(), "src", "prompts"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "architect.md"))) {
      return dir;
    }
  }

  throw new Error(
    `Prompts directory not found. Run \`npm run build\` (copies prompts to dist/prompts). Tried:\n${candidates.join("\n")}`,
  );
}

export function loadPrompt(role: PromptRole): string {
  const promptsDir = resolvePromptsDir();
  const filePath = path.join(promptsDir, PROMPT_FILES[role]);
  return fs.readFileSync(filePath, "utf8");
}

// Models have no clock and will otherwise invent dates from their training epoch
// (e.g. an ADR stamped a year in the past).
export function withTodayLine(prompt: string, isoDate: string): string {
  return `${prompt}\n\nToday's date is ${isoDate}. Use it wherever an artifact records a date.`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
