/**
 * E2E: Ollama subagent permission-boundary regression tests.
 *
 * Run with a verified capable model (see ADR-0014 / ADR-0015):
 *   PET_LLM_PROVIDER=ollama PET_LLM_MODEL=<model> npx vitest run tests/e2e
 *   npm run test:ollama   (uses qwen2.5:7b by default, change to suit your setup)
 *
 * The suite is SKIPPED automatically when PET_LLM_PROVIDER is not "ollama" or
 * PET_LLM_MODEL is unset, so it is invisible to normal CI (PET_MOCK_AGENTS=1).
 *
 * Two assertions per test:
 *   1. Permission boundary — runLiveAgent must not throw AND no files outside
 *      the role's allowed directory may be created or modified.  This assertion
 *      is meaningful regardless of model quality.
 *   2. Model capability — the designated output section must be non-trivially
 *      populated.  This assertion fails for models that do not reliably execute
 *      tool calls (see ADR-0015 for the verification protocol).
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "@/log.js";
import { problemHypothesisIdSchema } from "@/schemas/ids.js";
import { runLiveAgent } from "@/agents/run-agent.js";
import { createResearcherFixture } from "../helpers/researcher-fixture.js";
import { snapshotFixture } from "../helpers/fixture-diff.js";

const PROVIDER = process.env["PET_LLM_PROVIDER"] ?? "";
const MODEL = process.env["PET_LLM_MODEL"] ?? "";

async function ollamaReachable(): Promise<boolean> {
  const baseUrl = process.env["PET_LLM_BASE_URL"] ?? "http://localhost:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe.skipIf(PROVIDER !== "ollama" || !MODEL)(
  `E2E Ollama (${MODEL}): subagent permission boundaries`,
  () => {
    let skip = false;

    beforeAll(async () => {
      if (!(await ollamaReachable())) {
        skip = true;
        console.warn("[e2e] Ollama unreachable — skipping permission boundary tests");
      }
    });

    it(
      "researcher: permission boundary holds and Evidence is populated",
      { timeout: 300_000 },
      async () => {
        if (skip) return;

        const ctx = createResearcherFixture();
        // ctx.root = tmp/doc/product; runLiveAgent expects the doc/ root (one level up)
        // so that permission paths like /product/00-problem-hypotheses/** resolve correctly.
        const testDocRoot = path.resolve(ctx.root, "..");
        try {
          const hypPath = path.join(ctx.root, "hypotheses", "0001-hyp-proposed.md");
          const hypBody = fs.readFileSync(hypPath, "utf8");
          // Snapshot the product/ subtree — that's all agents are allowed to touch.
          const before = snapshotFixture(ctx.root);

          // Assertion 1 — permission boundary: must not throw.
          // Permission errors from deepagents FilesystemBackend surface as rejected promises.
          await runLiveAgent(
            "researcher",
            testDocRoot,
            {
              hypothesisId: problemHypothesisIdSchema.parse("PROB-0001"),
              hypothesisTitle: "Hypothesis: users need faster onboarding",
              hypothesisBody: hypBody,
            },
            createLogger({ verbose: false }),
          );

          const after = snapshotFixture(ctx.root);

          // Assertion 1a — no existing file outside hypotheses/ may be modified.
          // features/, tasks/, metrics/ all have sentinel stubs; any write there is a side-effect.
          for (const [rel, content] of before) {
            if (rel.startsWith("hypotheses/")) continue;
            if (rel.startsWith("orchestration/")) continue; // append-only log is OK
            expect(after.get(rel), `side-effect: ${rel} must not be modified`).toBe(content);
          }

          // Assertion 1b — no new files may appear outside hypotheses/.
          for (const rel of after.keys()) {
            if (before.has(rel)) continue;
            expect(rel, `unexpected new file outside hypotheses/: ${rel}`).toMatch(/^hypotheses\//);
          }

          // Assertion 2 — model capability: Evidence body must be non-trivially populated.
          // This fails for models that do not reliably execute tool calls.
          // If this assertion fails but 1a/1b pass, the permission system is healthy
          // but the model needs to be upgraded (see ADR-0015 verification protocol).
          const updated = after.get("hypotheses/0001-hyp-proposed.md") ?? "";
          const evidenceBody = updated.split("## Evidence")[1]?.trim() ?? "";
          expect(
            evidenceBody.length,
            "## Evidence must be populated — model did not execute tool calls (see ADR-0015)",
          ).toBeGreaterThan(10);
        } finally {
          ctx.cleanup();
        }
      },
    );
  },
);
