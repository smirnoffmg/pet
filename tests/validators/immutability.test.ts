import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateImmutability } from "@/validators/immutability.js";
import type { ParsedArtifact } from "@/store/parse.js";

function makeArtifact(
  kind: ParsedArtifact["kind"],
  filePath: string,
  frontmatter: Record<string, unknown>,
  body = "# Test\n\nContent\n",
): ParsedArtifact {
  return {
    kind,
    filePath,
    relativePath: path.basename(filePath),
    frontmatter: frontmatter as ParsedArtifact["frontmatter"],
    body,
  };
}

function gitExec(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: "ignore" });
}

describe("validateImmutability — schema-aware field filtering", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pet-immutability-"));
    gitExec("git init", repoRoot);
    gitExec("git config user.email test@test.com", repoRoot);
    gitExec("git config user.name Test", repoRoot);
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("ignores changes to stale fields no longer in the schema (e.g. target_metric_ids on hypothesis)", () => {
    const filePath = path.join(repoRoot, "prob-0001.md");
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n\n# Problem\n\nContent\n",
    );
    gitExec("git add . && git commit -m init", repoRoot);

    // Agent changed the stale field — schema no longer knows about it
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0002\n---\n\n# Problem\n\nContent\n",
    );
    const artifact = makeArtifact("hypothesis", filePath, {
      id: "PROB-0001",
      status: "accepted",
      target_metric_ids: ["MET-0002"],
    });

    const report = validateImmutability(repoRoot, [artifact]);
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("ignores removal of stale fields no longer in the schema", () => {
    const filePath = path.join(repoRoot, "prob-0001.md");
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n\n# Problem\n\nContent\n",
    );
    gitExec("git add . && git commit -m init", repoRoot);

    // Agent removed the stale field entirely
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\n---\n\n# Problem\n\nContent\n",
    );
    const artifact = makeArtifact("hypothesis", filePath, {
      id: "PROB-0001",
      status: "accepted",
    });

    const report = validateImmutability(repoRoot, [artifact]);
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("still flags body changes on accepted artifacts", () => {
    const filePath = path.join(repoRoot, "prob-0001.md");
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\n---\n\n# Problem\n\nOriginal.\n",
    );
    gitExec("git add . && git commit -m init", repoRoot);

    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\n---\n\n# Problem\n\nModified!\n",
    );
    const artifact = makeArtifact(
      "hypothesis",
      filePath,
      { id: "PROB-0001", status: "accepted" },
      "# Problem\n\nModified!\n",
    );

    const report = validateImmutability(repoRoot, [artifact]);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "immutability")).toBe(true);
  });

  it("still flags changes to schema-defined frontmatter fields", () => {
    const filePath = path.join(repoRoot, "met-0001.md");
    fs.writeFileSync(
      filePath,
      "---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n\n# Metric\n",
    );
    gitExec("git add . && git commit -m init", repoRoot);

    // Changed problem_hypothesis_id — that IS a schema field on metric
    fs.writeFileSync(
      filePath,
      "---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0002\n---\n\n# Metric\n",
    );
    const artifact = makeArtifact("metric", filePath, {
      id: "MET-0001",
      status: "accepted",
      problem_hypothesis_id: "PROB-0002",
    });

    const report = validateImmutability(repoRoot, [artifact]);
    expect(report.ok).toBe(false);
    expect(
      report.issues.some(
        (i) => i.code === "immutability" && i.message.includes("problem_hypothesis_id"),
      ),
    ).toBe(true);
  });

  it("allows status superseded_by change on accepted artifact", () => {
    const filePath = path.join(repoRoot, "prob-0001.md");
    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: accepted\n---\n\n# Problem\n\nContent\n",
    );
    gitExec("git add . && git commit -m init", repoRoot);

    fs.writeFileSync(
      filePath,
      "---\nid: PROB-0001\nstatus: superseded\nsuperseded_by: PROB-0002\n---\n\n# Problem\n\nContent\n",
    );
    const artifact = makeArtifact("hypothesis", filePath, {
      id: "PROB-0001",
      status: "superseded",
      superseded_by: "PROB-0002",
    });

    const report = validateImmutability(repoRoot, [artifact]);
    expect(report.ok).toBe(true);
  });
});
