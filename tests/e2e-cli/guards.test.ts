import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assertBinaryBuilt, runPet, runPetOk } from "./helpers/cli.js";
import { commitAll, createCliFixture } from "./helpers/fixture.js";
import type { CliFixture } from "./helpers/fixture.js";

/**
 * The rules the project calls non-negotiable, exercised through the real binary
 * against a committed git history — the only condition under which the
 * immutability validator actually runs.
 */
describe("guards: immutability, gates, and FK integrity", () => {
  let fx: CliFixture;

  const hypPath = (): string =>
    path.join(fx.product, "00-problem-hypotheses", "0001-users-abandon-checkout.md");
  const solPath = (): string =>
    path.join(fx.product, "02-solution-hypotheses", "0001-inline-address-validation.md");

  beforeAll(() => assertBinaryBuilt());

  beforeEach(() => {
    fx = createCliFixture("pet-guards");
    runPetOk(["new", "hypothesis", "Users abandon checkout"], { cwd: fx.root });
    runPetOk(["new", "metric", "--hypothesis", "PROB-0001", "Checkout completion rate"], {
      cwd: fx.root,
    });
    runPetOk(["new", "solution-hypothesis", "--metric", "MET-0001", "Inline address validation"], {
      cwd: fx.root,
    });
  });

  afterEach(() => fx?.cleanup());

  it("an accepted artifact's body cannot be edited once committed", () => {
    runPetOk(["accept", "hypothesis", "PROB-0001", "--yes"], { cwd: fx.root });
    commitAll(fx, "accept PROB-0001");

    // Sanity: committed and clean, so the validator has a HEAD to compare against.
    const clean = runPet(["validate"], { cwd: fx.root });
    expect(clean.status).toBe(0);
    expect(clean.transcript).not.toContain("no git history found");

    const raw = fs.readFileSync(hypPath(), "utf8");
    fs.writeFileSync(hypPath(), `${raw}\n\nRewriting history after the fact.\n`, "utf8");

    const edited = runPet(["validate"], { cwd: fx.root });
    expect(edited.status).toBe(1);
    expect(edited.transcript).toContain("immutability");
  });

  it("a rejected artifact is frozen, rationale included", () => {
    runPetOk(
      ["reject", "solution-hypothesis", "SOL-0001", "--rationale", "fails GDPR review", "--yes"],
      { cwd: fx.root },
    );
    commitAll(fx, "reject SOL-0001");

    const raw = fs.readFileSync(solPath(), "utf8");
    fs.writeFileSync(solPath(), raw.replace("fails GDPR review", "reworded later"), "utf8");

    const r = runPet(["validate"], { cwd: fx.root });
    expect(r.status).toBe(1);
    expect(r.transcript).toContain("Superseded and rejected artifacts must not be edited");
  });

  it("supersession is the sanctioned way to retire an accepted decision", () => {
    runPetOk(["accept", "solution-hypothesis", "SOL-0001", "--yes"], { cwd: fx.root });
    commitAll(fx, "accept SOL-0001");

    const r = runPet(
      ["reject", "solution-hypothesis", "SOL-0001", "--rationale", "changed our minds", "--yes"],
      { cwd: fx.root },
    );
    expect(r.status).toBe(1);
    expect(r.transcript).toContain("only proposed → rejected");
    expect(r.transcript).toContain("supersedes");
  });

  it("a dangling foreign key fails validation", () => {
    const raw = fs.readFileSync(solPath(), "utf8");
    fs.writeFileSync(solPath(), raw.replace("MET-0001", "MET-9999"), "utf8");

    const r = runPet(["validate"], { cwd: fx.root });
    expect(r.status).toBe(1);
    expect(r.transcript).toContain("MET-9999");
  });

  it("delivery refuses to run ahead of the human gate", () => {
    const r = runPet(["deliver", "--feature", "FEAT-0001", "--yes"], { cwd: fx.root });
    expect(r.status).toBe(1);
    expect(r.transcript).toContain("FEAT-0001");
  });

  it("rejecting warns when live features still depend on the alternative", () => {
    runPetOk(["accept", "solution-hypothesis", "SOL-0001", "--yes"], { cwd: fx.root });
    runPetOk(["discover", "--solution-hypothesis", "SOL-0001", "--yes"], { cwd: fx.root });
    runPetOk(["new", "solution-hypothesis", "--metric", "MET-0001", "Third-party autofill"], {
      cwd: fx.root,
    });

    // Point the fresh feature at SOL-0002 so rejecting it strands a dependent.
    const featDir = path.join(fx.product, "03-features");
    const featFile = path.join(featDir, fs.readdirSync(featDir)[0]!);
    const raw = fs.readFileSync(featFile, "utf8");
    fs.writeFileSync(featFile, raw.replace("SOL-0001", "SOL-0002"), "utf8");

    const r = runPet(
      ["reject", "solution-hypothesis", "SOL-0002", "--rationale", "too costly", "--yes"],
      { cwd: fx.root },
    );
    expect(r.status).toBe(0);
    expect(r.transcript).toContain("still reference SOL-0002");
    expect(r.transcript).toContain("FEAT-0001");
  });
});
