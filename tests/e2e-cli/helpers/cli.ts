import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..", "..");
export const petJs = path.join(repoRoot, "dist", "pet.js");

export function assertBinaryBuilt(): void {
  if (!fs.existsSync(petJs)) {
    throw new Error(`Missing ${petJs} — run \`npm run build\` before the e2e-cli suite.`);
  }
}

export interface PetResult {
  status: number;
  stdout: string;
  stderr: string;
  /** stdout + stderr, normalized — what the golden files record. */
  transcript: string;
}

export interface RunPetOptions {
  cwd: string;
  /** Extra environment. `PET_MOCK_AGENTS=1` is the default; pass `{}` to keep it. */
  env?: Record<string, string>;
  /** Text piped to stdin (for commands that prompt). */
  stdin?: string;
}

/**
 * Normalizes everything that varies between runs. Without this no CLI output can
 * be compared to a golden file: session ids are `Date.now()`, the repo hash is
 * derived from HEAD, and every `outcome` log line carries an ISO timestamp.
 */
export function normalize(raw: string, fixtureRoot?: string): string {
  let out = raw;

  if (fixtureRoot) {
    out = out.split(fixtureRoot).join("<REPO>");
    // macOS reports /var/... for /private/var/..., so both spellings occur.
    out = out.split(fixtureRoot.replace(/^\/private/, "")).join("<REPO>");
  }
  out = out.split(repoRoot).join("<PET>");
  out = out.split(os.homedir()).join("<HOME>");
  out = out.replace(/\/(private\/)?var\/folders\/[^\s"']*/g, "<TMP>");

  out = out.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<TS>");
  out = out.replace(/\d{4}-\d{2}-\d{2}/g, "<DATE>");
  out = out.replace(/\((\d+\.\d+)s\)/g, "(<T>s)");
  out = out.replace(/after \d+\.\d+s/g, "after <T>s");
  out = out.replace(/in \d+\.\d+s/g, "in <T>s");
  // The Ink panel reports whole seconds ("✓ Done in 1s"), so it needs its own
  // rule — and its box padding shrinks as the number grows a digit, which would
  // shift the closing border. Collapse runs of padding inside box lines too.
  out = out.replace(/(Done in|Running…) \d+s/g, "$1 <T>s");
  out = out.replace(/(│[^│\n]*?)[ ]{2,}(│)/g, "$1 $2");
  out = out.replace(/sessions\/\d{10,}/g, "sessions/<SESSION>");
  out = out.replace(/\b[0-9a-f]{40}\b/g, "<SHA>");
  out = out.replace(/\b[0-9a-f]{16}\b/g, "<HASH>");

  // Trailing whitespace differs with terminal width; strip it so goldens are stable.
  out = out
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n");

  return out.trimEnd();
}

export function runPet(args: string[], options: RunPetOptions): PetResult {
  const result = spawnSync(process.execPath, [petJs, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.stdin ?? "",
    env: {
      ...process.env,
      PET_MOCK_AGENTS: "1",
      // Keep output free of the ANSI the goldens would otherwise capture.
      // FORCE_COLOR must be cleared explicitly: `npm run test:e2e` sets it for
      // the Ink render tests, and chalk lets it win over NO_COLOR.
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      ...options.env,
    },
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  return {
    status: result.status ?? -1,
    stdout,
    stderr,
    transcript: normalize(`${stdout}${stderr}`, options.cwd),
  };
}

/** Runs a command and fails loudly if it did not exit 0 — for pipeline setup steps. */
export function runPetOk(args: string[], options: RunPetOptions): PetResult {
  const result = runPet(args, options);
  if (result.status !== 0) {
    throw new Error(
      `pet ${args.join(" ")} exited ${result.status}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
    );
  }
  return result;
}

/** Renders a transcript the way a reader would see it: the command, then its output. */
export function transcriptOf(args: string[], result: PetResult): string {
  return `$ pet ${args.join(" ")}\n${result.transcript}`;
}
