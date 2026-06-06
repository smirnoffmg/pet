import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const BANNED_IMPORT = [
  'import { ChatAnthropic } from "@langchain/anthropic";',
  "void ChatAnthropic;",
  "",
].join("\n");

const NEUTRAL_IMPORT = ['import { z } from "zod";', "void z;", ""].join("\n");

type LintResult = { ruleIds: (string | null)[]; errorCount: number };

async function lintSyntheticFile(relPath: string, content: string): Promise<LintResult> {
  const absPath = path.join(REPO_ROOT, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf8");
  try {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintFiles([absPath]);
    const messages = results[0]?.messages ?? [];
    return {
      ruleIds: messages.map((m) => m.ruleId),
      errorCount: results[0]?.errorCount ?? 0,
    };
  } finally {
    fs.unlinkSync(absPath);
  }
}

const SRC_SYNTHETIC = "src/__synthetic_provider_import_boundary__.ts";
const TESTS_SYNTHETIC = "tests/__synthetic_provider_import_boundary__.ts";

describe("provider package import boundary (ADR-0013 §Import constraint, ADR-0016 §3)", () => {
  beforeAll(() => {
    for (const rel of [SRC_SYNTHETIC, TESTS_SYNTHETIC]) {
      const abs = path.join(REPO_ROOT, rel);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
  });

  afterAll(() => {
    for (const rel of [SRC_SYNTHETIC, TESTS_SYNTHETIC]) {
      const abs = path.join(REPO_ROOT, rel);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
  });

  it("fires no-restricted-imports on a banned provider import inside src/", async () => {
    const { ruleIds, errorCount } = await lintSyntheticFile(SRC_SYNTHETIC, BANNED_IMPORT);
    expect(ruleIds).toContain("no-restricted-imports");
    expect(errorCount).toBeGreaterThan(0);
  });

  it("does not fire no-restricted-imports on a neutral import inside src/", async () => {
    const { ruleIds } = await lintSyntheticFile(SRC_SYNTHETIC, NEUTRAL_IMPORT);
    expect(ruleIds).not.toContain("no-restricted-imports");
  });

  it("does not fire no-restricted-imports on a banned provider import under tests/", async () => {
    const { ruleIds } = await lintSyntheticFile(TESTS_SYNTHETIC, BANNED_IMPORT);
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
