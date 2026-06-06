/**
 * E2E: Full pet pipeline with local Ollama — Researcher → DevOps.
 *
 * Run:
 *   PET_LLM_PROVIDER=ollama PET_LLM_MODEL=<model> npx vitest run tests/e2e/ollama-pipeline.test.ts
 *   npm run test:ollama
 *
 * Minimum model requirement: 70B+ with tool-calling support (see ADR-0015).
 * Verified capable: llama3.3, mistral-nemo, qwen2.5:72b, gemma3:27b.
 * 7-8B models (qwen3:8b, llama3.1:8b, etc.) are NOT capable of autonomous
 * multi-step tool execution in the deepagents context — they complete individual
 * tool calls but do not chain ls → read_file → write_file without external prompting.
 *
 * The suite is SKIPPED automatically when PET_LLM_PROVIDER is not "ollama" or
 * PET_LLM_MODEL is unset — invisible to normal CI (PET_MOCK_AGENTS=1).
 *
 * Test design (per ADR-0018):
 *   - Permission boundary assertions are HARD (always fail the test if violated).
 *   - Model capability assertions (did the agent produce content?) are SOFT
 *     (expect.soft — logged as failures but do not abort the test). This prevents
 *     cascade failures when small models are used: each step's pipeline setup
 *     (acceptArtifact, markTaskDone) runs before assertions, so later steps get
 *     a chance to run even when earlier capability checks fail.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "@/log.js";
import {
  problemHypothesisIdSchema,
  solutionHypothesisIdSchema,
  featureIdSchema,
  taskIdSchema,
  releaseIdSchema,
} from "@/schemas/ids.js";
import { runLiveAgent } from "@/agents/run-agent.js";
import { writeArtifact } from "@/store/index.js";
import { snapshotFixture } from "../helpers/fixture-diff.js";
import { createPipelineFixture } from "../helpers/pipeline-fixture.js";
import type { PipelineFixtureContext } from "../helpers/pipeline-fixture.js";
import type { FixtureSnapshot } from "../helpers/fixture-diff.js";

// ---------------------------------------------------------------------------
// Suite guards
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a markdown artifact file and return { id, title, body, frontmatter }. */
function parseArtifact(filePath: string): {
  id: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
} {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const titleMatch = /^#\s+(.+)$/m.exec(content);
  return {
    id: String(data["id"] ?? ""),
    title: titleMatch?.[1]?.trim() ?? "",
    body: content,
    frontmatter: data as Record<string, unknown>,
  };
}

/** Find all .md files in a directory whose frontmatter matches a predicate. */
function findArtifact(
  dir: string,
  predicate: (fm: Record<string, unknown>) => boolean,
): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const full = path.join(dir, name);
    try {
      const { data } = matter(fs.readFileSync(full, "utf8"));
      if (predicate(data as Record<string, unknown>)) return full;
    } catch {
      // skip unparseable files
    }
  }
  return undefined;
}

/** Accept an artifact by setting status: accepted in-place. */
function acceptArtifact(filePath: string): void {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  data["status"] = "accepted";
  fs.writeFileSync(
    filePath,
    matter.stringify(content, data as matter.GrayMatterFile<string>["data"]),
    "utf8",
  );
}

/** Mark a task artifact as done. */
function markTaskDone(filePath: string): void {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  data["status"] = "done";
  fs.writeFileSync(
    filePath,
    matter.stringify(content, data as matter.GrayMatterFile<string>["data"]),
    "utf8",
  );
}

/**
 * Assert permission boundary: files in `allowedPrefixes` may change; everything
 * else must be byte-identical to `before`. New files must also land in allowed dirs.
 *
 * This is a HARD assertion — permission boundary violations always fail the step.
 */
function assertPermissionBoundary(
  before: FixtureSnapshot,
  productRoot: string,
  allowedPrefixes: string[],
  stepLabel: string,
): void {
  const after = snapshotFixture(productRoot);

  for (const [rel, content] of before) {
    if (allowedPrefixes.some((p) => rel.startsWith(p))) continue;
    if (rel.startsWith("orchestration/")) continue;
    expect(after.get(rel), `${stepLabel} side-effect: ${rel} must not be modified`).toBe(content);
  }

  for (const rel of after.keys()) {
    if (before.has(rel)) continue;
    const allowed = allowedPrefixes.some((p) => rel.startsWith(p));
    expect(allowed, `${stepLabel} side-effect: unexpected new file ${rel}`).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(PROVIDER !== "ollama" || !MODEL)(
  `E2E Ollama pipeline (${MODEL}): Researcher → DevOps`,
  () => {
    let ctx: PipelineFixtureContext;
    let skip = false;
    const logger = createLogger({ verbose: false });

    beforeAll(async () => {
      if (!(await ollamaReachable())) {
        skip = true;
        console.warn("[e2e] Ollama unreachable — skipping pipeline tests");
        return;
      }
      ctx = createPipelineFixture();
    });

    afterAll(() => {
      ctx?.cleanup();
    });

    // -----------------------------------------------------------------------
    // Step 1: Researcher fills Evidence in PROB-0001
    // -----------------------------------------------------------------------
    it("Step 1 (Researcher): fills Evidence in PROB-0001", { timeout: 300_000 }, async () => {
      if (skip) return;

      const hypPath = findArtifact(
        path.join(ctx.productRoot, "hypotheses"),
        (fm) => fm["id"] === "PROB-0001",
      );
      expect(hypPath, "PROB-0001 fixture file must exist").toBeDefined();
      const { title, body } = parseArtifact(hypPath!);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "researcher",
        ctx.docRoot,
        {
          hypothesisId: problemHypothesisIdSchema.parse("PROB-0001"),
          hypothesisTitle: title,
          hypothesisBody: body,
        },
        logger,
      );

      // Accept PROB-0001 BEFORE capability assertion — prevents cascade if Evidence
      // was not populated (small models) from blocking Step 2.
      acceptArtifact(hypPath!);

      // HARD: permission boundary
      assertPermissionBoundary(before, ctx.productRoot, ["hypotheses/"], "Step 1");

      // SOFT: model capability (fails for models that don't chain tool calls — see ADR-0015)
      const updated = fs.readFileSync(hypPath!, "utf8");
      const evidenceBody = updated.split("## Evidence")[1]?.trim() ?? "";
      expect
        .soft(
          evidenceBody.length,
          "Step 1: ## Evidence must be populated (model did not write_file — see ADR-0015)",
        )
        .toBeGreaterThan(10);
    });

    // -----------------------------------------------------------------------
    // Step 2: SolutionDesigner creates SOL- for PROB-0001
    // -----------------------------------------------------------------------
    it("Step 2 (SolutionDesigner): creates SOL- for PROB-0001", { timeout: 300_000 }, async () => {
      if (skip) return;

      const hypPath = findArtifact(
        path.join(ctx.productRoot, "hypotheses"),
        (fm) => fm["id"] === "PROB-0001",
      );
      expect(hypPath, "PROB-0001 must exist after Step 1").toBeDefined();
      const { title, body } = parseArtifact(hypPath!);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "solution_designer",
        ctx.docRoot,
        {
          hypothesisId: problemHypothesisIdSchema.parse("PROB-0001"),
          hypothesisTitle: title,
          hypothesisBody: body,
        },
        logger,
        "spawn_solution_designer",
      );

      assertPermissionBoundary(
        before,
        ctx.productRoot,
        ["solution_hypotheses/", "metrics/"],
        "Step 2",
      );

      const solFiles = fs
        .readdirSync(path.join(ctx.productRoot, "solution_hypotheses"))
        .filter((f) => f.endsWith(".md"));

      // Accept the first SOL- BEFORE the capability assertion
      if (solFiles.length > 0) {
        const solPath = path.join(ctx.productRoot, "solution_hypotheses", solFiles[0]!);
        acceptArtifact(solPath);
      }

      // SOFT: capability
      expect
        .soft(solFiles.length, "Step 2: SolutionDesigner must create at least one SOL- file")
        .toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Step 3: FeatureDesigner creates FEAT- for SOL-
    // -----------------------------------------------------------------------
    it("Step 3 (FeatureDesigner): creates FEAT- for SOL-", { timeout: 300_000 }, async () => {
      if (skip) return;

      const solPath = findArtifact(
        path.join(ctx.productRoot, "solution_hypotheses"),
        (fm) => fm["status"] === "accepted",
      );
      expect(
        solPath,
        "An accepted SOL- must exist after Step 2 (small models cannot pass — see ADR-0015)",
      ).toBeDefined();
      const { id: solId, title: solTitle, body: solBody } = parseArtifact(solPath!);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "designer",
        ctx.docRoot,
        {
          solutionHypothesisId: solutionHypothesisIdSchema.parse(solId),
          solutionHypothesisTitle: solTitle,
          solutionHypothesisBody: solBody,
        },
        logger,
        "spawn_feature_designer",
      );

      assertPermissionBoundary(before, ctx.productRoot, ["features/"], "Step 3");

      const featFiles = fs
        .readdirSync(path.join(ctx.productRoot, "features"))
        .filter((f) => f.endsWith(".md"));

      if (featFiles.length > 0) {
        const featPath = path.join(ctx.productRoot, "features", featFiles[0]!);
        acceptArtifact(featPath);
      }

      expect
        .soft(featFiles.length, "Step 3: FeatureDesigner must create at least one FEAT- file")
        .toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Step 4: DesignerEnrich fills the accepted FEAT- body
    // -----------------------------------------------------------------------
    it("Step 4 (DesignerEnrich): fills FEAT- body", { timeout: 300_000 }, async () => {
      if (skip) return;

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["status"] === "accepted",
      );
      expect(featPath, "An accepted FEAT- must exist after Step 3").toBeDefined();
      const {
        id: featId,
        title: featTitle,
        body: featBody,
        frontmatter: featFm,
      } = parseArtifact(featPath!);

      const solId = String(featFm["solution_hypothesis_id"] ?? "");
      const solPath = solId
        ? findArtifact(
            path.join(ctx.productRoot, "solution_hypotheses"),
            (fm) => fm["id"] === solId,
          )
        : undefined;

      const { title: solTitle = "", body: solBody = "" } = solPath ? parseArtifact(solPath) : {};

      const bodyBefore = fs.readFileSync(featPath!, "utf8");
      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "designer",
        ctx.docRoot,
        {
          featureId: featureIdSchema.parse(featId),
          featureTitle: featTitle,
          featureBody: featBody,
          solutionHypothesisId: solId || "SOL-0001",
          solutionHypothesisTitle: solTitle,
          solutionHypothesisBody: solBody,
        },
        logger,
        "spawn_designer_enrich",
      );

      assertPermissionBoundary(before, ctx.productRoot, ["features/"], "Step 4");

      const updatedBody = fs.readFileSync(featPath!, "utf8");
      expect
        .soft(updatedBody.length, "Step 4: FEAT- body must be enriched by DesignerEnrich")
        .toBeGreaterThan(bodyBefore.length + 20);
    });

    // -----------------------------------------------------------------------
    // Step 5: Architect clears architectural review on FEAT-
    // -----------------------------------------------------------------------
    it("Step 5 (Architect): clears architectural_review_status", { timeout: 300_000 }, async () => {
      if (skip) return;

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["status"] === "accepted",
      );
      expect(featPath, "FEAT- must exist after Step 4").toBeDefined();
      const { id: featId, title: featTitle, body: featBody } = parseArtifact(featPath!);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "architect",
        ctx.docRoot,
        {
          featureId: featureIdSchema.parse(featId),
          featureTitle: featTitle,
          featureBody: featBody,
        },
        logger,
      );

      // Architect may write to features/ (update review status) and adr/ (new ADR)
      assertPermissionBoundary(before, ctx.productRoot, ["features/"], "Step 5");

      const { frontmatter } = parseArtifact(featPath!);
      expect
        .soft(
          frontmatter["architectural_review_status"],
          "Step 5: Architect must set architectural_review_status to cleared",
        )
        .toBe("cleared");
    });

    // -----------------------------------------------------------------------
    // Step 6: TechLead decomposes FEAT- into tasks
    // -----------------------------------------------------------------------
    it("Step 6 (TechLead): creates TASK- files for FEAT-", { timeout: 300_000 }, async () => {
      if (skip) return;

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["status"] === "accepted",
      );
      expect(featPath, "FEAT- must exist after Step 5").toBeDefined();
      const { id: featId, title: featTitle, body: featBody } = parseArtifact(featPath!);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "techlead",
        ctx.docRoot,
        {
          featureId: featureIdSchema.parse(featId),
          featureTitle: featTitle,
          featureBody: featBody,
        },
        logger,
      );

      assertPermissionBoundary(before, ctx.productRoot, ["tasks/"], "Step 6");

      const taskFiles = fs
        .readdirSync(path.join(ctx.productRoot, "tasks"))
        .filter((f) => f.endsWith(".md") && !f.includes("archive"));
      expect
        .soft(taskFiles.length, "Step 6: TechLead must create at least one TASK- file")
        .toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Step 7: Dev enriches the first TASK-
    // -----------------------------------------------------------------------
    it("Step 7 (Dev): enriches first TASK- body", { timeout: 300_000 }, async () => {
      if (skip) return;

      const taskPath = findArtifact(
        path.join(ctx.productRoot, "tasks"),
        (fm) => fm["status"] === "todo",
      );
      expect(taskPath, "A todo TASK- must exist after Step 6").toBeDefined();
      const {
        id: taskId,
        title: taskTitle,
        body: taskBody,
        frontmatter: taskFm,
      } = parseArtifact(taskPath!);

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["id"] === String(taskFm["feature_id"] ?? ""),
      );
      const {
        id: featId,
        title: featTitle,
        body: featBody,
      } = featPath ? parseArtifact(featPath) : { id: "FEAT-0001", title: "", body: "" };

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "dev",
        ctx.docRoot,
        {
          taskId: taskIdSchema.parse(taskId),
          taskTitle,
          taskBody,
          featureId: featureIdSchema.parse(featId),
          featureTitle: featTitle,
          featureBody: featBody,
        },
        logger,
        "spawn_dev",
      );

      assertPermissionBoundary(before, ctx.productRoot, ["tasks/"], "Step 7");

      // Mark all tasks done BEFORE capability assertion so Step 8 can proceed
      const allTaskFiles = fs
        .readdirSync(path.join(ctx.productRoot, "tasks"))
        .filter((f) => f.endsWith(".md"));
      for (const f of allTaskFiles) {
        markTaskDone(path.join(ctx.productRoot, "tasks", f));
      }

      const updatedTask = fs.readFileSync(taskPath!, "utf8");
      expect
        .soft(updatedTask.length, "Step 7: Dev must enrich the task body")
        .toBeGreaterThan(taskBody.length + 20);
    });

    // -----------------------------------------------------------------------
    // Step 8: QA creates a QA plan for FEAT-
    // -----------------------------------------------------------------------
    it("Step 8 (QA): creates QA plan for FEAT-", { timeout: 300_000 }, async () => {
      if (skip) return;

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["status"] === "accepted",
      );
      expect(featPath, "FEAT- must exist for QA step").toBeDefined();
      const { id: featId, title: featTitle, body: featBody } = parseArtifact(featPath!);

      const taskFiles = fs
        .readdirSync(path.join(ctx.productRoot, "tasks"))
        .filter((f) => f.endsWith(".md"));
      const taskIds = taskFiles
        .map((f) => {
          const { frontmatter } = parseArtifact(path.join(ctx.productRoot, "tasks", f));
          return String(frontmatter["id"] ?? "");
        })
        .filter((id) => id.startsWith("TASK-"))
        .map((id) => taskIdSchema.parse(id));

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "qa",
        ctx.docRoot,
        {
          featureId: featureIdSchema.parse(featId),
          featureTitle: featTitle,
          featureBody: featBody,
          taskIds,
        },
        logger,
        "spawn_qa",
      );

      assertPermissionBoundary(before, ctx.productRoot, ["qa_plans/"], "Step 8");

      const qaFiles = fs
        .readdirSync(path.join(ctx.productRoot, "qa_plans"))
        .filter((f) => f.endsWith(".md"));
      expect
        .soft(qaFiles.length, "Step 8: QA must create at least one QA plan file")
        .toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Step 9: DevOps adds deployment checklist to a release
    // -----------------------------------------------------------------------
    it("Step 9 (DevOps): adds deployment checklist to release", { timeout: 300_000 }, async () => {
      if (skip) return;

      const featPath = findArtifact(
        path.join(ctx.productRoot, "features"),
        (fm) => fm["status"] === "accepted",
      );
      expect(featPath, "FEAT- must exist for DevOps step").toBeDefined();
      const { id: featId } = parseArtifact(featPath!);

      // Create a proposed release artifact programmatically
      const releaseResult = writeArtifact(
        ctx.docRoot,
        "release",
        {
          id: releaseIdSchema.parse("REL-0001"),
          status: "proposed",
          feature_ids: [featureIdSchema.parse(featId)],
        },
        "v1.0 — initial pipeline release",
      );
      expect(releaseResult.isOk(), "Release artifact must be created successfully").toBe(true);
      const relPath = releaseResult.isOk() ? releaseResult.value : "";

      const { title: relTitle, body: relBody } = parseArtifact(relPath);

      const before = snapshotFixture(ctx.productRoot);

      await runLiveAgent(
        "devops",
        ctx.docRoot,
        {
          releaseId: releaseIdSchema.parse("REL-0001"),
          releaseTitle: relTitle,
          releaseBody: relBody,
          featureIds: [featureIdSchema.parse(featId)],
        },
        logger,
        "spawn_devops",
      );

      assertPermissionBoundary(before, ctx.productRoot, ["releases/"], "Step 9");

      const updatedRelease = fs.readFileSync(relPath, "utf8");
      expect
        .soft(
          updatedRelease.length,
          "Step 9: DevOps must enrich the release body with a deployment checklist",
        )
        .toBeGreaterThan(relBody.length + 30);
    });
  },
);
