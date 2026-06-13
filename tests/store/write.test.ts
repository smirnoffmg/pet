import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeArtifact } from "@/store/write.js";
import type { HypothesisFrontmatter } from "@/schemas/hypothesis.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-write-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fm: HypothesisFrontmatter = {
  id: "PROB-0001" as HypothesisFrontmatter["id"],
  status: "proposed",
};

describe("writeArtifact", () => {
  it("creates the file at the correct path", () => {
    const result = writeArtifact(tmp, "hypothesis", fm, "My Hypothesis");
    expect(result.isOk()).toBe(true);
    const filePath = result._unsafeUnwrap();
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain("product/00-problem-hypotheses");
    expect(filePath).toMatch(/0001-my-hypothesis\.md$/);
  });

  it("returns Err when file already exists", () => {
    writeArtifact(tmp, "hypothesis", fm, "My Hypothesis");
    const second = writeArtifact(tmp, "hypothesis", fm, "My Hypothesis");
    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().message).toMatch(/already exists/);
  });

  it("frontmatter round-trips through gray-matter", () => {
    const result = writeArtifact(tmp, "hypothesis", fm, "Round Trip");
    const filePath = result._unsafeUnwrap();
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    expect(parsed.data["id"]).toBe("PROB-0001");
    expect(parsed.data["status"]).toBe("proposed");
  });

  it("uses the provided body when given", () => {
    const result = writeArtifact(tmp, "hypothesis", fm, "Custom Body", "## Section\n\nContent.");
    const filePath = result._unsafeUnwrap();
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    expect(parsed.content).toContain("## Section");
  });

  it("uses scaffold body when body is omitted", () => {
    const result = writeArtifact(tmp, "hypothesis", fm, "Default Body");
    const filePath = result._unsafeUnwrap();
    const raw = fs.readFileSync(filePath, "utf8");
    expect(raw.length).toBeGreaterThan(20);
  });

  it("filename matches NNNN-kebab-title.md convention", () => {
    const result = writeArtifact(tmp, "hypothesis", fm, "Hello World Test");
    const filePath = result._unsafeUnwrap();
    expect(path.basename(filePath)).toBe("0001-hello-world-test.md");
  });
});
