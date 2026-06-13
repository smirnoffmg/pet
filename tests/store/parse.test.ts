import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseArtifactFile } from "@/store/parse.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-parse-test-"));
  fs.mkdirSync(path.join(tmp, "product/00-problem-hypotheses"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "product/01-metrics"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const validHyp = `---\nid: PROB-0001\nstatus: proposed\n---\n\n# Some hypothesis\n`;
const validMetric = `---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n\n# Some metric\n`;

describe("parseArtifactFile", () => {
  it("returns Ok for a valid hypothesis file", () => {
    const filePath = path.join(tmp, "product/00-problem-hypotheses/0001-some-hypothesis.md");
    fs.writeFileSync(filePath, validHyp);

    const result = parseArtifactFile(tmp, filePath);
    expect(result.isOk()).toBe(true);
    const artifact = result._unsafeUnwrap();
    expect(artifact.kind).toBe("hypothesis");
    expect(artifact.frontmatter.id).toBe("PROB-0001");
    expect(artifact.relativePath).toBe("product/00-problem-hypotheses/0001-some-hypothesis.md");
  });

  it("returns Ok for a valid metric file", () => {
    const filePath = path.join(tmp, "product/01-metrics/0001-some-metric.md");
    fs.writeFileSync(filePath, validMetric);

    const result = parseArtifactFile(tmp, filePath);
    expect(result.isOk()).toBe(true);
    const artifact = result._unsafeUnwrap();
    expect(artifact.kind).toBe("metric");
    expect(artifact.frontmatter.id).toBe("MET-0001");
  });

  it("returns Err when file does not exist", () => {
    const filePath = path.join(tmp, "product/00-problem-hypotheses/0099-missing.md");
    const result = parseArtifactFile(tmp, filePath);
    expect(result.isErr()).toBe(true);
  });

  it("returns Err when path is not in a recognized artifact directory", () => {
    const filePath = path.join(tmp, "some-unknown-dir/0001-foo.md");
    fs.mkdirSync(path.join(tmp, "some-unknown-dir"), { recursive: true });
    fs.writeFileSync(filePath, validHyp);

    const result = parseArtifactFile(tmp, filePath);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toMatch(/Cannot determine artifact kind/);
  });

  it("returns Err when frontmatter fails schema validation", () => {
    const filePath = path.join(tmp, "product/00-problem-hypotheses/0001-bad.md");
    // Missing required 'status' field
    fs.writeFileSync(filePath, "---\nid: PROB-0001\n---\n\n# Bad\n");

    const result = parseArtifactFile(tmp, filePath);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toMatch(/Schema validation failed/);
  });

  it("body is the content after frontmatter", () => {
    const filePath = path.join(tmp, "product/00-problem-hypotheses/0001-with-body.md");
    fs.writeFileSync(filePath, validHyp);

    const result = parseArtifactFile(tmp, filePath);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().body).toContain("Some hypothesis");
  });
});
