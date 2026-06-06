import fs from "node:fs";
import path from "node:path";
import { scanArtifacts } from "@/store/scan.js";

export type DocSnapshot = Map<string, { mtimeMs: number; size: number }>;

export function captureDocSnapshot(docRoot: string): DocSnapshot {
  const snap = new Map<string, { mtimeMs: number; size: number }>();
  const scan = scanArtifacts(docRoot);
  if (scan.isErr()) {
    return snap;
  }
  for (const a of scan.value) {
    const rel = path.relative(docRoot, a.filePath).replaceAll("\\", "/");
    const st = fs.statSync(a.filePath);
    snap.set(rel, { mtimeMs: st.mtimeMs, size: st.size });
  }
  return snap;
}

export function diffDocSnapshot(before: DocSnapshot, after: DocSnapshot): string[] {
  const lines: string[] = [];
  const allKeys = new Set([...before.keys(), ...after.keys()]);

  for (const key of [...allKeys].sort()) {
    const b = before.get(key);
    const a = after.get(key);
    if (!b && a) {
      lines.push(`+ ${key}`);
    } else if (b && !a) {
      lines.push(`- ${key}`);
    } else if (b && a && (b.mtimeMs !== a.mtimeMs || b.size !== a.size)) {
      lines.push(`~ ${key}`);
    }
  }

  return lines;
}
