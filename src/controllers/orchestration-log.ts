import fs from "node:fs";
import path from "node:path";

export function appendOrchestrationDecision(docRoot: string, line: string): void {
  const logPath = path.join(docRoot, "product/orchestration/decisions.md");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const entry = `\n- ${new Date().toISOString()} — ${line}\n`;
  fs.appendFileSync(logPath, entry, "utf8");
}
