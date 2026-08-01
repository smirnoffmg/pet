/**
 * Renders the CJM walkthrough to SVG terminal screenshots.
 *
 *   npm run screenshots              # mock agents — deterministic, free
 *   npm run screenshots:live         # hosted provider — real artifact prose
 *   npm run screenshots:ollama       # local model — real prose, no API spend
 *
 * The demo repository in frame is a Python ML scoring service: the audience is
 * Python developers, and the whole point is that the artifacts are markdown in
 * whatever repo you run the tool against.
 *
 * Output: doc/screenshots/NN-name.svg, committed. `freeze` is invoked with an
 * explicit --font.family, which keeps it from embedding a ~360KB webfont and
 * leaves the SVG a few hundred bytes of reviewable text.
 */
process.env["FORCE_COLOR"] = "3";

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputShowsModelFault } from "../src/agents/model-fault.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const petJs = path.join(repoRoot, "dist", "pet.js");
const outDir = path.join(repoRoot, "doc", "screenshots");

type Mode = "mock" | "ollama" | "live";
const mode: Mode = process.argv.includes("--ollama")
  ? "ollama"
  : process.argv.includes("--live")
    ? "live"
    : "mock";
const FONT = "JetBrains Mono, Menlo, DejaVu Sans Mono, monospace";

/** The path shown in the frames — never the real temp dir or a real home. */
const DISPLAY_CWD = "~/work/risk-scoring";

interface Shot {
  name: string;
  lines: string[];
}

const shots: Shot[] = [];
let fixture = "";

/**
 * freeze renders ANSI colour but not cursor movement, so an interactive prompt
 * that erases and repaints its line would otherwise appear two or three times.
 * Applying the erases ourselves leaves the frame a terminal would actually show.
 */
function collapseRedraws(text: string): string {
  return (
    text
      /* eslint-disable-next-line no-control-regex */
      .replace(/[^\n]*\x1b\[2K(?:\x1b\[\d*G)?/g, "")
      /* eslint-disable-next-line no-control-regex */
      .replace(/\x1b\[\?25[hl]/g, "")
      /* eslint-disable-next-line no-control-regex */
      .replace(/\x1b\[\d+G/g, "")
  );
}

/**
 * A refused agent action aborts the `pet` subprocess, and Node prints the raw
 * rejection — stack frames, node_modules paths, a version banner. None of that
 * belongs in a demo frame, and the refusal itself is the system working.
 */
function stripCrashDump(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex(
    (l) => /^\s*(node:internal|at |file:\/\/)/.test(l) || l.includes("node_modules"),
  );
  if (start === -1) return text;
  return lines.slice(0, start).join("\n").trimEnd();
}

function scrub(text: string): string {
  // The /private-prefixed spelling must go first: mkdtemp returns /var/... while
  // resolved paths in error messages come back as /private/var/...
  const privateFixture = fixture.startsWith("/private") ? fixture : `/private${fixture}`;
  return collapseRedraws(stripCrashDump(text))
    .split(privateFixture)
    .join(DISPLAY_CWD)
    .split(fixture)
    .join(DISPLAY_CWD)
    .split(os.homedir())
    .join("~")
    .replace(/sessions\/\d{10,}/g, "sessions/1738245900123")
    .replace(/\b[0-9a-f]{16}\b/g, "a3f21c9d84b7e065");
}

function pet(
  args: string[],
  opts: { capture?: boolean; stdin?: string; retried?: boolean } = {},
): string {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FORCE_COLOR: "3",
  };
  if (mode === "ollama") {
    env["PET_LLM_PROVIDER"] = "ollama";
    env["PET_LLM_MODEL"] = process.env["PET_LLM_MODEL"] ?? "gemma3:27b";
    delete env["PET_MOCK_AGENTS"];
  } else if (mode === "live") {
    // Whatever the environment already configures; anthropic is the default.
    delete env["PET_MOCK_AGENTS"];
  } else {
    env["PET_MOCK_AGENTS"] = "1";
  }

  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd: fixture,
    encoding: "utf8",
    env,
    input: opts.stdin ?? "",
  });
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;

  if (r.status !== 0) {
    const fault = outputShowsModelFault(combined);
    const label = fault ? "model refused (system held)" : `exited ${r.status}`;
    process.stderr.write(`! pet ${args.join(" ")} — ${label}\n`);
    if (fault && !opts.retried) {
      // Refusals are a dice roll, not a deterministic failure: one retry usually
      // gets a complete pipeline instead of frames that stop halfway.
      process.stderr.write(`  retrying once…\n`);
      return pet(args, { ...opts, retried: true });
    }
  }

  return scrub(combined);
}

/**
 * Long log lines would make freeze render a very wide frame that beamer then
 * scales down to unreadable; fold them at a word boundary instead. Escape
 * sequences count as zero width and survive the fold, so colour state carries
 * over to the continuation line.
 */
function wrapAnsiLine(line: string, max = 100): string[] {
  /* eslint-disable-next-line no-control-regex */
  const visibleLen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, "").length;
  const out: string[] = [];
  let rest = line;
  while (visibleLen(rest) > max) {
    let visible = 0;
    let cut = -1;
    let lastSpace = -1;
    for (let i = 0; i < rest.length; i++) {
      /* eslint-disable-next-line no-control-regex */
      const esc = /^\x1b\[[0-9;]*m/.exec(rest.slice(i));
      if (esc) {
        i += esc[0].length - 1;
        continue;
      }
      visible++;
      // Only break at spaces past the continuation indent, or the fold can
      // land on the indent itself and stop making progress.
      if (rest[i] === " " && visible > 10) lastSpace = i;
      if (visible > max) {
        cut = i;
        break;
      }
    }
    if (cut === -1) break;
    const br = lastSpace > 0 ? lastSpace : cut;
    out.push(rest.slice(0, br));
    rest = `    ${rest.slice(br + (rest[br] === " " ? 1 : 0))}`;
  }
  out.push(rest);
  return out;
}

/** One screenshot = a prompt line, the command's real output, repeated. */
function shot(name: string, commands: (string[] | { args: string[]; stdin: string })[]): void {
  const lines: string[] = [];
  for (const entry of commands) {
    const args = Array.isArray(entry) ? entry : entry.args;
    const stdin = Array.isArray(entry) ? undefined : entry.stdin;
    lines.push(`\x1b[32m❯\x1b[0m pet ${args.join(" ")}`);
    const output = pet(args, { capture: true, ...(stdin !== undefined ? { stdin } : {}) });
    lines.push(
      ...output
        .trimEnd()
        .split("\n")
        .flatMap((l) => wrapAnsiLine(l)),
    );
    lines.push("");
  }
  shots.push({ name, lines });
}

function freeze(shotItem: Shot): void {
  const ansiPath = path.join(os.tmpdir(), `pet-shot-${shotItem.name}.ansi`);
  fs.writeFileSync(ansiPath, `${shotItem.lines.join("\n").trimEnd()}\n`, "utf8");
  const out = path.join(outDir, `${shotItem.name}.svg`);
  execFileSync(
    "freeze",
    [
      "--language",
      "ansi",
      "--font.family",
      FONT,
      "--font.size",
      "13",
      "--padding",
      "20",
      "--margin",
      "0",
      "--border.radius",
      "6",
      "--window",
      "-o",
      out,
      ansiPath,
    ],
    { stdio: "ignore" },
  );
  fs.rmSync(ansiPath, { force: true });
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  process.stdout.write(`  ${path.relative(repoRoot, out)}  (${kb} KB)\n`);
}

/** Demo frames should not carry "no git history found" — commit as a user would. */
function commit(message: string): void {
  git(["add", "-A"]);
  git(["commit", "-qm", message]);
}

function git(args: string[]): void {
  execFileSync("git", args, { cwd: fixture, stdio: "ignore" });
}

function setupFixture(): void {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), "pet-shots-"));

  // A plausible Python ML service — `pet init` and the agents read these, and
  // the audience should see their own stack in frame (SPEC C2).
  fs.mkdirSync(path.join(fixture, "src", "risk_scoring"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, "README.md"),
    [
      "# risk-scoring",
      "",
      "Credit risk scoring service. Serves a gradient-boosted model behind a",
      "FastAPI endpoint, scoring loan applications in real time.",
      "",
      "Known weak spot: applicants with little credit history (thin-file) score",
      "poorly — the model leans on features most of them do not have.",
      "",
      "Each scoring request also carries the applicant's recent account",
      "transactions (last 90 days). The current model ignores them: it scores on",
      "bureau features alone.",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(fixture, "pyproject.toml"),
    [
      "[project]",
      'name = "risk-scoring"',
      'version = "2.3.0"',
      'requires-python = ">=3.11"',
      "dependencies = [",
      '  "fastapi>=0.115",',
      '  "scikit-learn>=1.5",',
      '  "pandas>=2.2",',
      '  "lightgbm>=4.5",',
      "]",
      "",
      "[tool.pytest.ini_options]",
      'testpaths = ["tests"]',
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(fixture, "src", "risk_scoring", "features.py"),
    [
      "from dataclasses import dataclass",
      "",
      "",
      "@dataclass(frozen=True)",
      "class ApplicantFeatures:",
      "    credit_history_months: int",
      "    open_tradelines: int",
      "    utilisation_ratio: float",
      "",
      "    @property",
      "    def is_thin_file(self) -> bool:",
      "        return self.credit_history_months < 24",
      "",
    ].join("\n"),
    "utf8",
  );
  git(["init", "-q"]);
  git(["config", "user.email", "dev@example.com"]);
  git(["config", "user.name", "Dev"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["add", "-A"]);
  git(["commit", "-qm", "initial"]);
}

function main(): void {
  if (!fs.existsSync(petJs)) {
    process.stderr.write("Missing dist/pet.js — run `npm run build` first.\n");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  setupFixture();

  process.stdout.write(`Rendering screenshots (${mode})\n`);

  // 1 — the problem, and the metric that would settle it
  shot("01-discovery-start", [
    ["new", "hypothesis", "Thin-file applicants are mispriced by the current model"],
    ["new", "metric", "--hypothesis", "PROB-0001", "Precision at the thin-file segment"],
  ]);

  // 2 — an agent run, with the live panel
  shot("02-researcher", [["discover", "--hypothesis", "PROB-0001", "--yes"]]);

  // 3 — the human gate
  commit("discovery: thin-file hypothesis and its metric");
  pet(["accept", "metric", "MET-0001", "--yes"]);
  shot("03-accept-gate", [["accept", "hypothesis", "PROB-0001", "--yes"]]);

  // 4 — alternatives, one of them rejected: the talk's central claim
  pet(["discover", "--hypothesis", "PROB-0001", "--yes"]);
  pet([
    "new",
    "solution-hypothesis",
    "--metric",
    "MET-0001",
    "Third-party bureau enrichment for prospect data",
  ]);
  commit("two candidate solutions");
  // Answered interactively, so the frame shows the gate a human actually passes.
  shot("04-reject-alternative", [
    {
      args: [
        "reject",
        "solution-hypothesis",
        "SOL-0002",
        "--rationale",
        "fails GDPR review for prospect data",
      ],
      stdin: "y\n",
    },
  ]);
  shot("05-alternatives-preserved", [["list", "sol"]]);

  // 5 — the whole pipeline
  pet(["accept", "solution-hypothesis", "SOL-0001", "--yes"]);
  pet(["discover", "--solution-hypothesis", "SOL-0001", "--yes"]);
  pet(["discover", "--feature", "FEAT-0001", "--yes"]);
  pet(["accept", "feature", "FEAT-0001", "--yes"]);
  pet(["deliver", "--feature", "FEAT-0001", "--yes"]);
  pet(["deliver", "--feature", "FEAT-0001", "--yes"]);
  commit("feature scoped and decomposed");
  shot("06-pipeline", [["list"]]);
  shot("07-next-action", [["next"]]);

  // 6 — immutability: the rule that makes the record trustworthy
  const hypDir = path.join(fixture, "doc/product/00-problem-hypotheses");
  const hyp = path.join(hypDir, fs.readdirSync(hypDir)[0]!);
  fs.appendFileSync(hyp, "\nQuietly rewriting what we believed back then.\n", "utf8");
  shot("08-immutability", [["validate"]]);

  for (const s of shots) freeze(s);

  fs.rmSync(fixture, { recursive: true, force: true });
  process.stdout.write(`\n${shots.length} screenshots written to doc/screenshots/\n`);
}

main();
