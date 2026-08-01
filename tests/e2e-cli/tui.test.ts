import { afterAll, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import stripAnsi from "strip-ansi";
import { assertBinaryBuilt, runPetOk } from "./helpers/cli.js";
import { createCliFixture } from "./helpers/fixture.js";
import type { CliFixture } from "./helpers/fixture.js";
import { TreeUI } from "@/cli/tree-ui.js";
import { ReplUI } from "@/cli/repl-ui.js";

/**
 * The Tree UI and REPL cannot be driven as subprocesses — without a TTY they
 * never receive the `q` that resolves their exit promise, so a spawned `pet`
 * hangs. They are rendered in-process instead, which is also what produces the
 * ANSI frames the screenshot script turns into SVGs.
 */
async function frameOf(element: React.ReactElement, ms = 400): Promise<string> {
  const instance = render(element);
  await new Promise((r) => setTimeout(r, ms));
  const frame = instance.lastFrame() ?? "";
  instance.unmount();
  return frame;
}

describe("TUI entry points render the pipeline", () => {
  let fx: CliFixture;

  beforeAll(() => {
    assertBinaryBuilt();
    fx = createCliFixture("pet-tui");
    runPetOk(["new", "hypothesis", "Users abandon checkout"], { cwd: fx.root });
    runPetOk(["new", "metric", "--hypothesis", "PROB-0001", "Checkout completion rate"], {
      cwd: fx.root,
    });
    runPetOk(["accept", "hypothesis", "PROB-0001", "--yes"], { cwd: fx.root });
    runPetOk(["new", "solution-hypothesis", "--metric", "MET-0001", "Inline address validation"], {
      cwd: fx.root,
    });
    runPetOk(["new", "solution-hypothesis", "--metric", "MET-0001", "Third-party autofill"], {
      cwd: fx.root,
    });
    runPetOk(
      ["reject", "solution-hypothesis", "SOL-0002", "--rationale", "fails GDPR review", "--yes"],
      { cwd: fx.root },
    );
    // Six `pet` subprocesses; the 10s default hook timeout is not enough for
    // this under full-suite load, and it is a fixture build, not the test.
  }, 120_000);

  afterAll(() => fx?.cleanup());

  it("the tree shows the artifact hierarchy with per-status colouring", async () => {
    const frame = await frameOf(
      React.createElement(TreeUI, {
        docRoot: fx.doc,
        repoRoot: fx.root,
        repoName: "checkout-service",
        branch: "main",
        onExit: () => {},
      }),
    );
    const plain = stripAnsi(frame);

    expect(plain).toContain("PROB-0001");
    expect(plain).toContain("SOL-0001");
    expect(plain).toContain("SOL-0002");
    expect(plain).toContain("rejected");
    expect(plain).toContain("checkout-service");
  });

  // Chalk resolves its colour level at import time from stdout, and
  // ink-testing-library's stream is not a TTY — so ANSI is only emitted when
  // FORCE_COLOR is set, which `npm run test:e2e` does.
  it.skipIf(!process.env["FORCE_COLOR"])(
    "a rejected artifact is rendered in red, distinct from proposed",
    async () => {
      const frame = await frameOf(
        React.createElement(TreeUI, {
          docRoot: fx.doc,
          repoRoot: fx.root,
          repoName: "checkout-service",
          branch: "main",
          onExit: () => {},
        }),
      );

      const rejectedLine = frame.split("\n").find((l) => stripAnsi(l).includes("SOL-0002"));
      const proposedLine = frame.split("\n").find((l) => stripAnsi(l).includes("SOL-0001"));

      // 31 is the SGR code Ink emits for red; the ESC byte is intentional.
      /* eslint-disable no-control-regex */
      expect(rejectedLine).toMatch(/\[31m/);
      expect(proposedLine).not.toMatch(/\[31m/);
      /* eslint-enable no-control-regex */
    },
  );

  it("the repl proposes the next pipeline action for confirmation", async () => {
    const frame = await frameOf(React.createElement(ReplUI, { docRoot: fx.doc, onExit: () => {} }));
    const plain = stripAnsi(frame);

    expect(plain).toContain("pet repl");
    expect(plain).toMatch(/pet (accept|discover|deliver|qa|release|new)/);
  });

  it("neither component enables raw mode on a non-TTY stdin", async () => {
    // ink-testing-library supplies a non-TTY stdin, so isRawModeSupported is
    // `undefined`. Before the `=== true` coercion this threw "Raw mode is not
    // supported" and dumped a React stack over the command's real output.
    await expect(
      frameOf(
        React.createElement(TreeUI, {
          docRoot: fx.doc,
          repoRoot: fx.root,
          repoName: "checkout-service",
          branch: "main",
          onExit: () => {},
        }),
        150,
      ),
    ).resolves.not.toContain("Raw mode is not supported");
  });
});
