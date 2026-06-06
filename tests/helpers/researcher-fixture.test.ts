import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createResearcherFixture,
  createVariantFixture,
  teardownResearcherFixture,
} from "./researcher-fixture.js";

describe("createResearcherFixture smoke test", () => {
  it("creates all seven expected files and returns a usable context", () => {
    const ctx = createResearcherFixture();
    try {
      const expectedFiles = [
        "00-problem-hypotheses/0001-hyp-proposed.md",
        "00-problem-hypotheses/0002-hyp-proposed-with-evidence.md",
        "00-problem-hypotheses/0003-hyp-accepted.md",
        "00-problem-hypotheses/0004-hyp-invalidated.md",
        "03-features/0001-sentinel.md",
        "04-tasks/0001-sentinel.md",
        "01-metrics/0001-sentinel.md",
      ];

      for (const rel of expectedFiles) {
        expect(fs.existsSync(path.join(ctx.root, rel)), `expected file missing: ${rel}`).toBe(true);
      }

      // hyp-proposed.md: status proposed, Evidence heading present, body empty
      const proposed = fs.readFileSync(
        path.join(ctx.root, "00-problem-hypotheses", "0001-hyp-proposed.md"),
        "utf8",
      );
      expect(proposed).toMatch(/^status:\s*proposed/m);
      // Evidence heading must exist
      expect(proposed).toMatch(/^## Evidence/m);
      // Evidence section must have no body content (empty or only whitespace before next ## or EOF)
      const evidenceMatch = /## Evidence[ \t]*\n([\s\S]*?)(?=\n## |$)/i.exec(proposed);
      expect(evidenceMatch).not.toBeNull();
      expect(evidenceMatch![1]!.trim()).toBe("");

      // hyp-proposed-with-evidence.md: Evidence block must have non-empty content
      const withEvidence = fs.readFileSync(
        path.join(ctx.root, "00-problem-hypotheses", "0002-hyp-proposed-with-evidence.md"),
        "utf8",
      );
      expect(withEvidence).toMatch(/^status:\s*proposed/m);
      const evMatch = /## Evidence[ \t]*\n([\s\S]*?)(?=\n## |$)/i.exec(withEvidence);
      expect(evMatch).not.toBeNull();
      expect(evMatch![1]!.trim().length).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
    // temp directory must be gone after cleanup
    expect(fs.existsSync(ctx.root)).toBe(false);
  });

  it("cleanup() removes the temp directory", () => {
    const ctx = createResearcherFixture();
    expect(fs.existsSync(ctx.root)).toBe(true);
    teardownResearcherFixture(ctx);
    expect(fs.existsSync(ctx.root)).toBe(false);
  });

  it("createVariantFixture produces unique Context content per variantIndex", () => {
    const defaultCtx = createResearcherFixture();
    const variantCtx = createVariantFixture(3);
    try {
      const defaultContent = fs.readFileSync(
        path.join(defaultCtx.root, "00-problem-hypotheses", "0001-hyp-proposed.md"),
        "utf8",
      );
      const variantContent = fs.readFileSync(
        path.join(variantCtx.root, "00-problem-hypotheses", "0001-hyp-proposed.md"),
        "utf8",
      );

      // The Context section body must differ between the default and variant fixture
      const extractContext = (src: string): string => {
        const m = /## Context[ \t]*\n([\s\S]*?)(?=\n## )/i.exec(src);
        return m?.[1] ?? "";
      };

      expect(extractContext(variantContent)).not.toBe(extractContext(defaultContent));
      // The variant index must appear somewhere in the file
      expect(variantContent).toContain("variant 3");
    } finally {
      defaultCtx.cleanup();
      variantCtx.cleanup();
    }
  });
});
