import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotFixture, assertNoChange, assertFixtureDiff } from "./fixture-diff.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-fd-test-"));
}

function rmTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Builds a minimal fixture file with the given evidence body. */
function makeHypContent(evidenceBody: string): string {
  return [
    "---",
    "id: PROB-0001",
    "status: proposed",
    "---",
    "",
    "# Hypothesis: title",
    "",
    "## Context",
    "",
    "Context body.",
    "",
    "## Evidence",
    "",
    evidenceBody,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assertNoChange", () => {
  it("passes when nothing changed", () => {
    const tmp = makeTmp();
    try {
      fs.writeFileSync(path.join(tmp, "a.md"), "content a");
      fs.writeFileSync(path.join(tmp, "b.md"), "content b");
      const snap = snapshotFixture(tmp);
      expect(() => assertNoChange(snap, tmp)).not.toThrow();
    } finally {
      rmTmp(tmp);
    }
  });

  it("throws when one file changed", () => {
    const tmp = makeTmp();
    try {
      fs.writeFileSync(path.join(tmp, "a.md"), "content a");
      fs.writeFileSync(path.join(tmp, "b.md"), "content b");
      const snap = snapshotFixture(tmp);
      fs.writeFileSync(path.join(tmp, "a.md"), "CHANGED content a");
      expect(() => assertNoChange(snap, tmp)).toThrow(/a\.md/);
    } finally {
      rmTmp(tmp);
    }
  });
});

describe("assertFixtureDiff", () => {
  it("passes for a valid happy-path mutation — only ## Evidence body changed", () => {
    const tmp = makeTmp();
    try {
      fs.mkdirSync(path.join(tmp, "hypotheses"), { recursive: true });
      const before = makeHypContent("");
      const after = makeHypContent("New evidence found.\n");
      fs.writeFileSync(path.join(tmp, "hypotheses", "target.md"), before);
      fs.writeFileSync(path.join(tmp, "sentinel.md"), "sentinel content");
      const snap = snapshotFixture(tmp);

      // Simulate agent writing only to Evidence
      fs.writeFileSync(path.join(tmp, "hypotheses", "target.md"), after);

      expect(() =>
        assertFixtureDiff({
          snapshot: snap,
          root: tmp,
          targetHypothesisPath: "hypotheses/target.md",
          expectEvidenceChanged: true,
        }),
      ).not.toThrow();
    } finally {
      rmTmp(tmp);
    }
  });

  it("throws for scope creep — a non-Evidence section was modified", () => {
    const tmp = makeTmp();
    try {
      fs.mkdirSync(path.join(tmp, "hypotheses"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "hypotheses", "target.md"), makeHypContent(""));
      fs.writeFileSync(path.join(tmp, "sentinel.md"), "sentinel content");
      const snap = snapshotFixture(tmp);

      // Agent modifies ## Context as well as ## Evidence — scope creep
      const tampered = [
        "---",
        "id: PROB-0001",
        "status: proposed",
        "---",
        "",
        "# Hypothesis: title",
        "",
        "## Context",
        "",
        "TAMPERED context body.",
        "",
        "## Evidence",
        "",
        "New evidence.\n",
      ].join("\n");
      fs.writeFileSync(path.join(tmp, "hypotheses", "target.md"), tampered);

      expect(() =>
        assertFixtureDiff({
          snapshot: snap,
          root: tmp,
          targetHypothesisPath: "hypotheses/target.md",
          expectEvidenceChanged: true,
        }),
      ).toThrow(/scope creep.*## Context/);
    } finally {
      rmTmp(tmp);
    }
  });

  it("throws for a side-effect — a sentinel file outside the target path was modified", () => {
    const tmp = makeTmp();
    try {
      fs.mkdirSync(path.join(tmp, "hypotheses"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "hypotheses", "target.md"), makeHypContent(""));
      fs.writeFileSync(path.join(tmp, "sentinel.md"), "sentinel content");
      const snap = snapshotFixture(tmp);

      // Agent modifies Evidence correctly but also touches a sentinel file
      fs.writeFileSync(
        path.join(tmp, "hypotheses", "target.md"),
        makeHypContent("New evidence.\n"),
      );
      fs.writeFileSync(path.join(tmp, "sentinel.md"), "MODIFIED sentinel");

      expect(() =>
        assertFixtureDiff({
          snapshot: snap,
          root: tmp,
          targetHypothesisPath: "hypotheses/target.md",
          expectEvidenceChanged: true,
        }),
      ).toThrow(/side-effect.*sentinel\.md/);
    } finally {
      rmTmp(tmp);
    }
  });
});
