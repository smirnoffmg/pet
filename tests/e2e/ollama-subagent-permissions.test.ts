/**
 * E2E: Ollama subagent permission-boundary regression tests.
 *
 * Run with a model verified to chain tool calls (see ADR-0014 / ADR-0015):
 *   PET_LLM_PROVIDER=ollama PET_LLM_MODEL=<model> npx vitest run tests/e2e
 *   npm run test:ollama   (override with PET_LLM_MODEL=<model>)
 *
 * The suite is SKIPPED automatically when PET_LLM_PROVIDER is not "ollama" or
 * PET_LLM_MODEL is unset, so it is invisible to normal CI (PET_MOCK_AGENTS=1).
 *
 * Two assertions per test, split by what they prove (ADR-0018):
 *   1. Permission boundary — HARD. runLiveAgent must not throw AND no file
 *      outside the role's allowed directory may be created or modified. This is
 *      meaningful regardless of model quality, so a violation always fails.
 *   2. Model capability — SOFT. The designated output section must be
 *      non-trivially populated. A weak model fails this without implying any
 *      defect in the permission system, so it is recorded, not fatal.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "@/log.js";
import { problemHypothesisIdSchema } from "@/schemas/ids.js";
import { runLiveAgent } from "@/agents/run-agent.js";
import { createResearcherFixture } from "../helpers/researcher-fixture.js";
import { snapshotFixture } from "../helpers/fixture-diff.js";
import { runAgentCapturingDenials } from "../helpers/agent-error.js";

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
          const hypPath = path.join(ctx.root, "00-problem-hypotheses", "0001-hyp-proposed.md");
          const hypBody = fs.readFileSync(hypPath, "utf8");
          // Snapshot the product/ subtree — that's all agents are allowed to touch.
          const before = snapshotFixture(ctx.root);

          // A refused write is the boundary working, so it is separated from a
          // genuine crash rather than counted as a boundary violation.
          const outcome = await runAgentCapturingDenials(() =>
            runLiveAgent(
              "researcher",
              testDocRoot,
              {
                hypothesisId: problemHypothesisIdSchema.parse("PROB-0001"),
                hypothesisTitle: "Hypothesis: users need faster onboarding",
                hypothesisBody: hypBody,
              },
              createLogger({ verbose: false }),
            ),
          );

          // HARD — anything other than a permission denial is a real defect.
          if (outcome.fatal !== null) throw outcome.fatal;

          const after = snapshotFixture(ctx.root);

          // Assertion 1a (HARD) — no existing file outside 00-problem-hypotheses/
          // may be modified. 03-features/, 04-tasks/ and 01-metrics/ hold sentinel
          // stubs, so any write there is a side-effect.
          for (const [rel, content] of before) {
            if (rel.startsWith("00-problem-hypotheses/")) continue;
            if (rel.startsWith("orchestration/")) continue; // append-only log is OK
            expect(after.get(rel), `side-effect: ${rel} must not be modified`).toBe(content);
          }

          // Assertion 1b (HARD) — no new file may appear outside that directory.
          for (const rel of after.keys()) {
            if (before.has(rel)) continue;
            expect(rel, `unexpected new file outside 00-problem-hypotheses/: ${rel}`).toMatch(
              /^00-problem-hypotheses\//,
            );
          }

          // SOFT — the model was refused (forbidden path, or malformed tool call).
          // The refusal proves the system works; the reaching proves the model is weak.
          expect
            .soft(
              outcome.faults,
              `system refused invalid model behaviour (code is fine): ${outcome.faults.join(", ")}`,
            )
            .toEqual([]);

          // Assertion 2 (SOFT) — model capability. A model that cannot chain tool
          // calls leaves Evidence empty; that says nothing about the permission
          // system, so it is recorded rather than fatal (ADR-0018).
          const updated = after.get("00-problem-hypotheses/0001-hyp-proposed.md") ?? "";
          const evidenceBody = updated.split("## Evidence")[1]?.trim() ?? "";
          expect
            .soft(
              evidenceBody.length,
              "## Evidence must be populated — model did not execute tool calls (see ADR-0015)",
            )
            .toBeGreaterThan(10);
        } finally {
          ctx.cleanup();
        }
      },
    );
  },
);
