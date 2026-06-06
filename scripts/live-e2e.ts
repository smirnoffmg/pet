import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { findRepoRoot } from "../src/store/repo-root.js";

const repoRoot = findRepoRoot();
const petJs = path.join(repoRoot, "dist", "pet.js");

function fail(msg: string): never {
  process.stderr.write(`live-e2e: ${msg}\n`);
  process.exit(1);
}

if (!process.env["ANTHROPIC_API_KEY"]) {
  fail("ANTHROPIC_API_KEY not set. Required for the live dogfood run (see ADR-0008).");
}
if (process.env["PET_MOCK_AGENTS"]) {
  fail("PET_MOCK_AGENTS is set; refusing to run live with mock mode enabled. Unset it.");
}
if (!fs.existsSync(petJs)) {
  fail(`Missing ${petJs}. Run 'npm run build' first.`);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "pet-live-e2e-"));
process.stdout.write(`live-e2e: fixture = ${fixture}\n`);

fs.mkdirSync(path.dirname(petJs), { recursive: true });
fs.writeFileSync(path.join(repoRoot, "dist", "live-e2e-fixture-path.txt"), fixture);

fs.cpSync(path.join(repoRoot, "doc"), path.join(fixture, "doc"), { recursive: true });

function purgeFeatureTasks(tasksDir: string, featureId: string): string[] {
  if (!fs.existsSync(tasksDir)) return [];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    const full = path.join(tasksDir, entry.name);
    if (entry.isDirectory()) {
      removed.push(...purgeFeatureTasks(full, featureId));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const raw = fs.readFileSync(full, "utf8");
    const pattern = new RegExp(`^feature_id:\\s*${featureId}$`, "m");
    if (pattern.test(raw)) {
      fs.unlinkSync(full);
      removed.push(path.relative(fixture, full));
    }
  }
  return removed;
}

const purged = purgeFeatureTasks(path.join(fixture, "doc/product/04-tasks"), "FEAT-0004");
process.stdout.write(
  `live-e2e: removed ${purged.length} fixture task(s) referencing FEAT-0004 so DeliveryLead is not idle:\n`,
);
for (const p of purged) process.stdout.write(`  - ${p}\n`);

const childEnv = { ...process.env };
delete childEnv["PET_MOCK_AGENTS"];

function run(label: string, args: string[]): number {
  process.stdout.write(`\nlive-e2e: ${label} -> pet ${args.join(" ")}\n\n`);
  const r = spawnSync(process.execPath, [petJs, ...args], {
    cwd: fixture,
    env: childEnv,
    stdio: "inherit",
  });
  return r.status ?? 1;
}

const deliverStatus = run("running live deliver", ["deliver", "--feature", "FEAT-0004", "--yes"]);
if (deliverStatus !== 0) {
  fail(`deliver exited with status ${deliverStatus}. Fixture preserved at ${fixture}`);
}

const validateStatus = run("running validate on fixture", ["validate"]);
if (validateStatus !== 0) {
  fail(`validate exited with status ${validateStatus}. Fixture preserved at ${fixture}`);
}

const tasksDir = path.join(fixture, "doc/product/04-tasks");
const newFeat4: string[] = [];
for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
  const raw = fs.readFileSync(path.join(tasksDir, entry.name), "utf8");
  if (/^feature_id:\s*FEAT-0004$/m.test(raw)) {
    newFeat4.push(entry.name);
  }
}

if (newFeat4.length === 0) {
  fail(
    `No new FEAT-0004 task files produced. Fixture preserved at ${fixture}. Inspect logs and decisions.md.`,
  );
}

process.stdout.write(`\nlive-e2e: SUCCESS\n`);
process.stdout.write(`  fixture:        ${fixture}\n`);
process.stdout.write(`  deliver exit:   ${deliverStatus}\n`);
process.stdout.write(`  validate exit:  ${validateStatus}\n`);
process.stdout.write(`  new FEAT-0004 task files (${newFeat4.length}):\n`);
for (const f of newFeat4) process.stdout.write(`    - ${f}\n`);
process.stdout.write(
  `\nNext: record evidence in doc/product/orchestration/decisions.md per TASK-0008,\n` +
    `then accept ADR-0008 and update REL-0001.\n`,
);
