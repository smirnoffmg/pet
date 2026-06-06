import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import matter from "gray-matter";

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
}));

const { runAcceptHypothesis, runAcceptSolutionHypothesis, runAcceptFeature } =
  await import("@/cli/accept-cmd.js");

interface Fixture {
  root: string;
  doc: string;
}

function writeArtifact(fixture: Fixture, relPath: string, content: string): string {
  const full = path.join(fixture.doc, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  // Append a per-fixture nonce so gray-matter's content-keyed parse cache
  // does not collide across tests (the production code mutates the cached
  // data object when promoting status, which would otherwise leak into the
  // next test's parse result).
  const nonce = `<!-- nonce: ${randomBytes(8).toString("hex")} -->\n`;
  fs.writeFileSync(full, content + nonce, "utf8");
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

  beforeEach(() => {
    originalCwd = process.cwd();
    fixture = createFixture();
    confirmMock.mockReset();
    process.chdir(fixture.root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  describe("runAcceptHypothesis", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\n---\n# M\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );

      const code = await runAcceptHypothesis("PROB-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set, aborts when user declines", async () => {
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptHypothesis("PROB-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(statusOf(file)).toBe("proposed");
    });

    it("invokes confirm when yes is not set, promotes when user accepts", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\n---\n# M\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: proposed\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      confirmMock.mockResolvedValueOnce(true);

      const code = await runAcceptHypothesis("PROB-0001");

      expect(code).toBe(0);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(statusOf(file)).toBe("accepted");
    });
  });

  describe("runAcceptSolutionHypothesis", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\ntarget_metric_id: MET-0001\n---\n# S\n`,
      );

      const code = await runAcceptSolutionHypothesis("SOL-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: proposed\nproblem_hypothesis_id: PROB-0001\ntarget_metric_id: MET-0001\n---\n# S\n`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptSolutionHypothesis("SOL-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(statusOf(file)).toBe("proposed");
    });
  });

  describe("runAcceptFeature", () => {
    it("bypasses confirm and writes status: accepted when yes=true", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\ntarget_metric_id: MET-0001\n---\n# S\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/03-features/0001-f.md",
        `---\nid: FEAT-0001\nstatus: proposed\nsolution_hypothesis_id: SOL-0001\narchitectural_review_status: pending\n---\n# F\n`,
      );

      const code = await runAcceptFeature("FEAT-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("accepted");
    });

    it("invokes confirm when yes is not set", async () => {
      writeArtifact(
        fixture,
        "product/01-metrics/0001-m.md",
        `---\nid: MET-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# M\n`,
      );
      writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );
      writeArtifact(
        fixture,
        "product/02-solution-hypotheses/0001-s.md",
        `---\nid: SOL-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\ntarget_metric_id: MET-0001\n---\n# S\n`,
      );
      const file = writeArtifact(
        fixture,
        "product/03-features/0001-f.md",
        `---\nid: FEAT-0001\nstatus: proposed\nsolution_hypothesis_id: SOL-0001\narchitectural_review_status: pending\n---\n# F\n`,
      );
      confirmMock.mockResolvedValueOnce(false);

      const code = await runAcceptFeature("FEAT-0001");

      expect(code).toBe(1);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(statusOf(file)).toBe("proposed");
    });
  });

  describe("--yes does not promote artifacts that aren't proposed", () => {
    it("returns 0 and preserves status: accepted hypothesis without prompting", async () => {
      const file = writeArtifact(
        fixture,
        "product/00-problem-hypotheses/0001-h.md",
        `---\nid: PROB-0001\nstatus: accepted\ntarget_metric_ids:\n  - MET-0001\n---\n# H\n`,
      );

      const code = await runAcceptHypothesis("PROB-0001", { yes: true });

      expect(code).toBe(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(statusOf(file)).toBe("accepted");
    });
  });
});
