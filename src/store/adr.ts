import fs from "node:fs";
import path from "node:path";
import { ADR_DIR } from "./paths.js";

export function nextAdrNumber(docRoot: string): number {
  const adrDir = path.join(docRoot, ADR_DIR);
  if (!fs.existsSync(adrDir)) {
    return 1;
  }
  const files = fs.readdirSync(adrDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    return 1;
  }
  const numbers = files
    .map((f) => {
      const match = /^(\d+)-/.exec(f);
      return match?.[1] !== undefined ? Number.parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}
