import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assertBinaryBuilt, runPet, runPetOk, transcriptOf } from "./helpers/cli.js";
import { artifactTree, commitAll, createCliFixture, idsIn } from "./helpers/fixture.js";
import type { CliFixture } from "./helpers/fixture.js";

/**
 * Walks the Customer Journey Map (`doc/product/context/cjm.md`) end to end against
 * the real `dist/pet.js`, in mock-agent mode.
 *
 * Steps share one fixture and run in order — this is a journey, not a set of
 * independent cases. Each stage records a normalized transcript golden, so a
 * change in what the user sees shows up as a reviewable diff.
 */
describe("CJM: discovery → delivery → QA → release", () => {
  let fx: CliFixture;
  const transcripts: string[] = [];

  const record = (args: string[], result: { transcript: string }): void => {
    transcripts.push(transcriptOf(args, result as never));
  };

  beforeAll(() => {
    assertBinaryBuilt();
    fx = createCliFixture("pet-cjm");
  });

  afterAll(() => fx?.cleanup());

  it("stage 1 — `pet init` is the one journey step mock mode cannot serve", () => {
    const args = ["init"];
    const r = runPet(args, {
      cwd: fx.root,
      env: { PET_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "" },
    });
    record(args, r);

    // `runInit` calls createModel() directly and never consults PET_MOCK_AGENTS,
    // so the documented "bypass LLM calls" flag does not cover onboarding.
    expect(r.status).toBe(1);
    expect(r.transcript).toContain("Scanning project...");
    expect(fs.existsSync(path.join(fx.product, "context", "project.md"))).toBe(false);
  });

  it("stage 2a — a problem hypothesis is the root; a metric hangs off it", () => {
    const a1 = ["new", "hypothesis", "Users abandon checkout at the shipping step"];
    record(a1, runPetOk(a1, { cwd: fx.root }));

    // The CJM documents `pet new metric` first, then `new hypothesis --metric`.
    // That order cannot work: MET carries problem_hypothesis_id, so PROB must exist.
    const a2 = ["new", "metric", "--hypothesis", "PROB-0001", "Checkout completion rate"];
    record(a2, runPetOk(a2, { cwd: fx.root }));

    expect(idsIn(fx, "00-problem-hypotheses")).toEqual(["PROB-0001"]);
    expect(idsIn(fx, "01-metrics")).toEqual(["MET-0001"]);
  });

  it("stage 2b — Researcher fills Evidence, then the human gate promotes", () => {
    const a1 = ["discover", "--hypothesis", "PROB-0001", "--yes"];
    const r1 = runPetOk(a1, { cwd: fx.root });
    record(a1, r1);
    expect(r1.transcript).toContain("spawn Researcher for PROB-0001");

    const hyp = path.join(
      fx.product,
      "00-problem-hypotheses",
      "0001-users-abandon-checkout-at-the-shipping-step.md",
    );
    expect(fs.readFileSync(hyp, "utf8")).toContain("Mock research:");

    const a2 = ["accept", "metric", "MET-0001", "--yes"];
    record(a2, runPetOk(a2, { cwd: fx.root }));
    const a3 = ["accept", "hypothesis", "PROB-0001", "--yes"];
    record(a3, runPetOk(a3, { cwd: fx.root }));
  });

  it("stage 2c — an accepted hypothesis fans out into solution hypotheses", () => {
    const args = ["discover", "--hypothesis", "PROB-0001", "--yes"];
    const r = runPetOk(args, { cwd: fx.root });
    record(args, r);

    expect(r.transcript).toContain("spawn SolutionDesigner for PROB-0001");
    expect(idsIn(fx, "02-solution-hypotheses")).toEqual(["SOL-0001"]);
  });

  it("stage 2d — a rejected alternative is preserved, not deleted", () => {
    // A second alternative, so the journey has something real to reject.
    const a1 = [
      "new",
      "solution-hypothesis",
      "--metric",
      "MET-0001",
      "Third-party address autofill",
    ];
    record(a1, runPetOk(a1, { cwd: fx.root }));

    const a2 = [
      "reject",
      "solution-hypothesis",
      "SOL-0002",
      "--rationale",
      "fails GDPR review for prospect data",
      "--yes",
    ];
    const r2 = runPetOk(a2, { cwd: fx.root });
    record(a2, r2);

    const a3 = ["list", "sol"];
    const r3 = runPetOk(a3, { cwd: fx.root });
    record(a3, r3);
    expect(r3.transcript).toContain("× SOL-0002   rejected");
  });

  it("stage 2e — an accepted solution fans out into a feature", () => {
    const a1 = ["accept", "solution-hypothesis", "SOL-0001", "--yes"];
    record(a1, runPetOk(a1, { cwd: fx.root }));

    const a2 = ["discover", "--solution-hypothesis", "SOL-0001", "--yes"];
    const r2 = runPetOk(a2, { cwd: fx.root });
    record(a2, r2);
    expect(r2.transcript).toContain("spawn FeatureDesigner");

    // A freshly created feature is a scaffold; DesignerEnrich fills the body.
    const a3 = ["discover", "--feature", "FEAT-0001", "--yes"];
    const r3 = runPetOk(a3, { cwd: fx.root });
    record(a3, r3);
    expect(r3.transcript).toContain("spawn Designer(enrich)");

    const a4 = ["accept", "feature", "FEAT-0001", "--yes"];
    record(a4, runPetOk(a4, { cwd: fx.root }));
  });

  it("stage 3 — delivery decomposes the feature into tasks", () => {
    // Delivery is a reconciler: one step per invocation. The first run clears
    // architectural review (Architect), and only then does TechLead decompose.
    // The CJM shows a single `pet deliver` line, which under-describes this.
    const a1 = ["deliver", "--feature", "FEAT-0001", "--yes"];
    const r1 = runPetOk(a1, { cwd: fx.root });
    record(a1, r1);
    expect(r1.transcript).toContain("spawn Architect");
    expect(idsIn(fx, "04-tasks")).toEqual([]);

    const a1b = ["deliver", "--feature", "FEAT-0001", "--yes"];
    const r1b = runPetOk(a1b, { cwd: fx.root });
    record(a1b, r1b);
    expect(r1b.transcript).toContain("spawn TechLead");
    expect(idsIn(fx, "04-tasks")).toEqual(["TASK-0001"]);

    const a2 = ["develop", "--task", "TASK-0001", "--yes"];
    const r2 = runPetOk(a2, { cwd: fx.root });
    record(a2, r2);
    expect(r2.transcript).toContain("spawn Dev");

    // `pet task done` stamps commit_sha from HEAD, so the work must be committed.
    commitAll(fx, "implement TASK-0001");

    const a3 = ["task", "done", "TASK-0001"];
    const r3 = runPetOk(a3, { cwd: fx.root });
    record(a3, r3);
    expect(fs.existsSync(path.join(fx.product, "04-tasks", "archive"))).toBe(true);
  });

  it("stage 4 — QA plan and release, each behind its own gate", () => {
    const a1 = ["qa", "--feature", "FEAT-0001", "--yes"];
    record(a1, runPetOk(a1, { cwd: fx.root }));
    expect(idsIn(fx, "05-qa-plans")).toEqual(["QA-0001"]);

    const a2 = ["accept", "qa-plan", "QA-0001", "--yes"];
    record(a2, runPetOk(a2, { cwd: fx.root }));

    const a3 = ["new", "release", "--features", "FEAT-0001", "v0.1.0"];
    record(a3, runPetOk(a3, { cwd: fx.root }));

    const a4 = ["release", "--release", "REL-0001", "--yes"];
    const r4 = runPetOk(a4, { cwd: fx.root });
    record(a4, r4);
    expect(r4.transcript).toContain("spawn DevOps");

    const a5 = ["accept", "release", "REL-0001", "--yes"];
    record(a5, runPetOk(a5, { cwd: fx.root }));
  });

  it("stage 5 — steady state: the pipeline validates and reports itself", () => {
    const a1 = ["validate"];
    const r1 = runPetOk(a1, { cwd: fx.root });
    record(a1, r1);
    expect(r1.transcript).toContain("Validation passed");

    const a2 = ["list"];
    record(a2, runPetOk(a2, { cwd: fx.root }));

    const a3 = ["next"];
    record(a3, runPetOk(a3, { cwd: fx.root }));
  });

  it("produces the expected artifact tree", async () => {
    await expect(artifactTree(fx).join("\n")).toMatchFileSnapshot(
      "./__goldens__/cjm-artifact-tree.txt",
    );
  });

  it("produces the expected terminal transcript", async () => {
    await expect(transcripts.join("\n\n")).toMatchFileSnapshot("./__goldens__/cjm-transcript.txt");
  });
});
