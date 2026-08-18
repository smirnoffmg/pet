import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
}));

const { runAcceptHypothesis, runAcceptSolutionHypothesis, runAcceptFeature, runAcceptMetric } =
  await import("@/cli/accept-cmd.js");

const HYP_BODY = "# H\n\n## Context\n\nCtx.\n\n## Evidence\n\nEv.\n";
const SOL_BODY = "# S\n\n## Decision\n\nDo X.\n\n## Success criteria\n\nY >= 20%.\n";
const FEAT_BODY =
  "# F\n\n## Context\n\nCtx.\n\n## Decision\n\nDo X.\n\n## Acceptance criteria\n\n- AC1\n\n## Consequences\n\nCons.\n";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-accept-yes-"));
  const doc = path.join(root, "doc");
  fs.mkdirSync(doc, { recursive: true });
  return { root, doc };
}

function statusOf(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  return (matter(raw).data as { status?: string }).status ?? "";
}

describe("runAccept* --yes flag", () => {
  let originalCwd: string;
  let fixture: Fixture;
  const spyStdout = () => vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  let stdoutSpy: ReturnType<typeof spyStdout>;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixture = createFixture();
    confirmMock.mockReset();
    stdoutSpy = spyStdout();
    process.chdir(fixture.root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    stdoutSpy.mockRestore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  describe("runAcceptHypothesis", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\n---\n${HYP_BODY}`,
      );

      const code = await runAcceptHypothesis("PROB-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set, aborts when user declines", async () => {
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\n---\n${HYP_BODY}`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptHypothesis("PROB-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("PROB-0001"));
      expect(statusOf(file)).toBe("proposed");
    });

    it("invokes confirm when yes is not set, promotes when user accepts", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\n---\n${HYP_BODY}`,
      );
      confirmMock.mockResolvedValueOnce(true);

      const code = await runAcceptHypothesis("PROB-0001");

      expect(code).toBe(0);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("PROB-0001"));
      expect(statusOf(file)).toBe("accepted");
    });
  });

  describe("runAcceptSolutionHypothesis", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: proposed\nmetric_ids:\n  - MET-0001\n---\n${SOL_BODY}`,
      );

      const code = await runAcceptSolutionHypothesis("SOL-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: proposed\nmetric_ids:\n  - MET-0001\n---\n${SOL_BODY}`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptSolutionHypothesis("SOL-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("SOL-0001"));
      expect(statusOf(file)).toBe("proposed");
    });
  });

  describe("runAcceptFeature", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: accepted\nmetric_ids:\n  - MET-0001\n---\n# S\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/03-features/0001-f.md",
        `---\nid: FEAT-0001\nstatus: proposed\nsolution_hypothesis_id: SOL-0001\narchitectural_review_status: pending\n---\n${FEAT_BODY}`,
      );

      const code = await runAcceptFeature("FEAT-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: accepted\nmetric_ids:\n  - MET-0001\n---\n# S\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/03-features/0001-f.md",
        `---\nid: FEAT-0001\nstatus: proposed\nsolution_hypothesis_id: SOL-0001\narchitectural_review_status: pending\n---\n${FEAT_BODY}`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptFeature("FEAT-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Discernment checklist"));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("FEAT-0001"));
      expect(statusOf(file)).toBe("proposed");
    });
  });

  describe("content readiness gate", () => {
    const spyStderr = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

    it("refuses a scaffold metric even with yes=true", async () => {
      const errSpy = spyStderr();
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n# M\n\n## Decision\n\n## How we measure\n`,
      );

      const code = await runAcceptMetric("MET-0001", { yes: true });

      expect(code).toBe(1);
      expect(statusOf(file)).toBe("proposed");
      const message = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(message).toContain("MET-0001");
      expect(message).toContain("Decision");
      expect(message).toContain("How we measure");
      errSpy.mockRestore();
    });

    it("refuses a hypothesis with any empty section, before prompting", async () => {
      const errSpy = spyStderr();
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\n---\n# H\n\n## Context\n\nCtx.\n\n## Evidence\n`,
      );

      const code = await runAcceptHypothesis("PROB-0001");

      expect(code).toBe(1);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("proposed");
      const message = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(message).toContain("Evidence");
      errSpy.mockRestore();
    });

    it("refuses a title-only body as a scaffold", async () => {
      const errSpy = spyStderr();
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n# M\n`,
      );

      const code = await runAcceptMetric("MET-0001", { yes: true });

      expect(code).toBe(1);
      expect(statusOf(file)).toBe("proposed");
      errSpy.mockRestore();
    });

    it("accepts a filled metric with yes=true", async () => {
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\n---\n# M\n\n## Decision\n\nRate = a / b.\n\n## How we measure\n\nQuery the audit log.\n`,
      );

      const code = await runAcceptMetric("MET-0001", { yes: true });

      expect(code).toBe(0);
      expect(statusOf(file)).toBe("accepted");
    });
  });

  describe("--yes does not promote artifacts that aren't proposed", () => {
    it("returns 0 and preserves status: accepted hypothesis without prompting", async () => {
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\n---\n# H\n`,
      );

      const code = await runAcceptHypothesis("PROB-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("accepted");
    });
  });
});
