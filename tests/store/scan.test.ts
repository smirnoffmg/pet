import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanArtifacts, buildIndex } from "@/store/scan.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-scan-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string) {
  const full = path.join(tmp, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

describe("scanArtifacts", () => {
  it("returns Ok with empty array when docRoot has no artifact dirs", () => {
    const result = scanArtifacts(tmp);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(0);
  });

  it("finds and parses a valid hypothesis artifact", () => {
    writeFile(
      "product/00-problem-hypotheses/0001-some-hypothesis.md",
      "---\nid: PROB-0001\nstatus: proposed\n---\n\n# Some hypothesis\n",
    );

    const result = scanArtifacts(tmp);
    expect(result.isOk()).toBe(true);
    const artifacts = result._unsafeUnwrap();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.kind).toBe("hypothesis");
    expect(artifacts[0]!.frontmatter.id).toBe("PROB-0001");
  });

  it("finds artifacts across multiple kind directories", () => {
    writeFile(
      "product/00-problem-hypotheses/0001-hyp.md",
      "---\nid: PROB-0001\nstatus: proposed\n---\n\n# Hyp\n",
    );
    writeFile(
      "product/01-metrics/0001-metric.md",
      "---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n\n# Metric\n",
    );

    const result = scanArtifacts(tmp);
    expect(result.isOk()).toBe(true);
    const artifacts = result._unsafeUnwrap();
    expect(artifacts).toHaveLength(2);
    const kinds = artifacts.map((a) => a.kind).sort();
    expect(kinds).toEqual(["hypothesis", "metric"]);
  });

  it("returns Err when any file has invalid frontmatter", () => {
    writeFile(
      "product/00-problem-hypotheses/0001-bad.md",
      "---\nid: PROB-0001\n---\n\n# Missing status\n",
    );

    const result = scanArtifacts(tmp);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toMatch(/Schema validation failed/);
  });

  it("walks subdirectories recursively", () => {
    writeFile(
      "product/04-tasks/archive/0001-done-task.md",
      "---\nid: TASK-0001\nstatus: done\nfeature_id: FEAT-0001\n---\n\n# Done task\n",
    );

    const result = scanArtifacts(tmp);
    expect(result.isOk()).toBe(true);
    const artifacts = result._unsafeUnwrap();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.kind).toBe("task");
  });
});

describe("buildIndex", () => {
  it("returns a Map keyed by artifact ID", () => {
    writeFile(
      "product/00-problem-hypotheses/0001-hyp.md",
      "---\nid: PROB-0001\nstatus: proposed\n---\n\n# Hyp\n",
    );
    writeFile(
      "product/01-metrics/0001-metric.md",
      "---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n\n# Metric\n",
    );

    const artifacts = scanArtifacts(tmp)._unsafeUnwrap();
    const index = buildIndex(artifacts);

    expect(index.size).toBe(2);
    expect(index.has("PROB-0001" as Parameters<typeof index.has>[0])).toBe(true);
    expect(index.has("MET-0001" as Parameters<typeof index.has>[0])).toBe(true);
  });

  it("returns empty Map for empty artifact list", () => {
    expect(buildIndex([])).toEqual(new Map());
  });
});
