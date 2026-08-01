import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
}));

const { runRejectSolutionHypothesis } = await import("@/cli/reject-cmd.js");

interface Fixture {
  root: string;
  doc: string;
}

function writeArtifact(fixture: Fixture, relPath: string, content: string): string {
  const full = path.join(fixture.doc, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-reject-"));
  const doc = path.join(root, "doc");
  fs.mkdirSync(doc, { recursive: true });
  return { root, doc };
}

function frontmatterOf(filePath: string): { status?: string; rejection_rationale?: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  return matter(raw).data as { status?: string; rejection_rationale?: string };
}

/** PROB → MET → SOL, the chain the full-repo validation needs to pass. */
function seedChain(fixture: Fixture, solStatus: string): string {
  writeArtifact(
    fixture,
    "product/00-problem-hypotheses/0001-h.md",
    `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
  );
  writeArtifact(
    fixture,
    "product/01-metrics/0001-m.md",
    `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
  );
  return writeArtifact(
    fixture,
    "product/02-solution-hypotheses/0001-s.md",
    `---\nid: SOL-0001\nstatus: ${solStatus}\nmetric_ids:\n  - MET-0001\n---\n# S\n`,
  );
}

describe("runRejectSolutionHypothesis", () => {
  let originalCwd: string;
  let fixture: Fixture;
  const spyStdout = () => vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  let stdoutSpy: ReturnType<typeof spyStdout>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixture = createFixture();
    confirmMock.mockReset();
    stdoutSpy = spyStdout();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(fixture.root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    stdoutSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("writes status and rationale, and logs the transition", async () => {
    const file = seedChain(fixture, "proposed");

    const code = await runRejectSolutionHypothesis("SOL-0001", {
      rationale: "fails GDPR review for prospect data",
      yes: true,
    });

    expect(code).toBe(0);
    expect(frontmatterOf(file)).toMatchObject({
      status: "rejected",
      rejection_rationale: "fails GDPR review for prospect data",
    });

    const log = fs.readFileSync(
      path.join(fixture.doc, "product/orchestration/decisions.md"),
      "utf8",
    );
    expect(log).toContain("reject solution-hypothesis SOL-0001");
    expect(log).toContain("fails GDPR review for prospect data");
  });

  it("refuses without a rationale and leaves the artifact untouched", async () => {
    const file = seedChain(fixture, "proposed");

    const code = await runRejectSolutionHypothesis("SOL-0001", { yes: true });

    expect(code).toBe(1);
    expect(frontmatterOf(file).status).toBe("proposed");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("requires a rationale"));
  });

  it("refuses a whitespace-only rationale", async () => {
    const file = seedChain(fixture, "proposed");

    const code = await runRejectSolutionHypothesis("SOL-0001", { rationale: "   ", yes: true });

    expect(code).toBe(1);
    expect(frontmatterOf(file).status).toBe("proposed");
  });

  it("refuses to reject an accepted artifact and points at supersession", async () => {
    const file = seedChain(fixture, "accepted");

    const code = await runRejectSolutionHypothesis("SOL-0001", {
      rationale: "too costly",
      yes: true,
    });

    expect(code).toBe(1);
    expect(frontmatterOf(file).status).toBe("accepted");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("supersedes"));
  });

  it("reports a missing artifact", async () => {
    seedChain(fixture, "proposed");

    const code = await runRejectSolutionHypothesis("SOL-9999", { rationale: "x", yes: true });

    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("is idempotent on an already rejected artifact", async () => {
    writeArtifact(
      fixture,
      "product/00-problem-hypotheses/0001-h.md",
      `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
    );
    writeArtifact(
      fixture,
      "product/01-metrics/0001-m.md",
      `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
    );
    const file = writeArtifact(
      fixture,
      "product/02-solution-hypotheses/0001-s.md",
      `---\nid: SOL-0001\nstatus: rejected\nrejection_rationale: original reason\nmetric_ids:\n  - MET-0001\n---\n# S\n`,
    );

    const code = await runRejectSolutionHypothesis("SOL-0001", {
      rationale: "new reason",
      yes: true,
    });

    expect(code).toBe(0);
    expect(frontmatterOf(file).rejection_rationale).toBe("original reason");
  });

  it("prints the rejection checklist and aborts when the user declines", async () => {
    const file = seedChain(fixture, "proposed");
    confirmMock.mockResolvedValueOnce(false);

    const code = await runRejectSolutionHypothesis("SOL-0001", { rationale: "too costly" });

    expect(code).toBe(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Rejection checklist"));
    expect(frontmatterOf(file).status).toBe("proposed");
  });

  it("warns when active features still reference the solution", async () => {
    const file = seedChain(fixture, "proposed");
    writeArtifact(
      fixture,
      "product/03-features/0001-f.md",
      `---\nid: FEAT-0001\nstatus: proposed\nsolution_hypothesis_id: SOL-0001\n---\n# F\n`,
    );

    const code = await runRejectSolutionHypothesis("SOL-0001", {
      rationale: "too costly",
      yes: true,
    });

    expect(code).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("FEAT-0001"));
    expect(frontmatterOf(file).status).toBe("rejected");
  });
});
