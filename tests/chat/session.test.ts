import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inputMock, selectMock, confirmMock, runOrchestrateMock } = vi.hoisted(() => ({
  inputMock: vi.fn(),
  selectMock: vi.fn(),
  confirmMock: vi.fn(),
  runOrchestrateMock: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
  select: selectMock,
  confirm: confirmMock,
}));

vi.mock("@/cli/orchestrate-cmd.js", () => ({
  runOrchestrate: runOrchestrateMock,
}));

const { runChatSession } = await import("@/chat/session.js");

function spyOnStreams() {
  return {
    stdout: vi.spyOn(process.stdout, "write").mockReturnValue(true),
    stderr: vi.spyOn(process.stderr, "write").mockReturnValue(true),
  };
}

describe("runChatSession", () => {
  const originalDebug = process.env["PET_DEBUG"];
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    selectMock.mockReset();
    confirmMock.mockReset();
    runOrchestrateMock.mockReset();
    runOrchestrateMock.mockResolvedValue(0);
    confirmMock.mockResolvedValue(false);
    spies = spyOnStreams();
    delete process.env["PET_DEBUG"];
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
    if (originalDebug === undefined) {
      delete process.env["PET_DEBUG"];
    } else {
      process.env["PET_DEBUG"] = originalDebug;
    }
  });

  it("prints the welcome line before prompting", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");

    await runChatSession({ repoRoot: "/tmp/repo" });

    const firstWrite = String(spies.stdout.mock.calls[0]?.[0] ?? "");
    expect(firstWrite).toContain("Welcome to pet chat");
    expect(firstWrite).toContain("I'll help you create the right artifact");
  });

  it("routes a clearly explore-problem input directly to the explore branch (no select menu)", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(inputMock).toHaveBeenCalledTimes(1);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("routes a clearly design-solution input directly to the design branch (no select menu)", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(selectMock).not.toHaveBeenCalled();
  });

  it("routes a clearly status input directly to the status branch (no select menu)", async () => {
    inputMock.mockResolvedValueOnce("what's pending");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(selectMock).not.toHaveBeenCalled();
  });

  it("falls back to a select menu when the input is ambiguous", async () => {
    inputMock.mockResolvedValueOnce("I need to do something important");
    selectMock.mockResolvedValueOnce("explore-problem");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(selectMock).toHaveBeenCalledTimes(1);
    const args = selectMock.mock.calls[0]?.[0] as
      | { message: string; choices: Array<{ value: string; name: string }> }
      | undefined;
    expect(args?.message).toBe("What would you like to do?");
    expect(args?.choices.map((c) => c.value)).toEqual([
      "explore-problem",
      "design-solution",
      "status",
    ]);
    expect(args?.choices.map((c) => c.name)).toEqual([
      "Explore / research a problem",
      "Design or build a solution",
      "Check status / see what's pending",
    ]);
  });

  it("honours the select-menu choice when input was ambiguous", async () => {
    inputMock.mockResolvedValueOnce("I need to do something important");
    selectMock.mockResolvedValueOnce("design-solution");
    process.env["PET_DEBUG"] = "1";

    await runChatSession({ repoRoot: "/tmp/repo" });

    const debugLines = spies.stderr.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("[pet chat] resolved intent"));
    expect(debugLines.length).toBeGreaterThanOrEqual(1);
    expect(debugLines.join("")).toContain("design-solution");
  });

  it("emits the resolved-intent debug line to stderr when PET_DEBUG=1", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    process.env["PET_DEBUG"] = "1";

    await runChatSession({ repoRoot: "/tmp/repo" });

    const wroteResolved = spies.stderr.mock.calls.some((c) =>
      String(c[0]).includes("[pet chat] resolved intent: explore-problem"),
    );
    expect(wroteResolved).toBe(true);
  });

  it("does not emit the chat-session debug line when PET_DEBUG is unset", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");

    await runChatSession({ repoRoot: "/tmp/repo" });

    const wroteResolved = spies.stderr.mock.calls.some((c) => String(c[0]).includes("[pet chat]"));
    expect(wroteResolved).toBe(false);
  });

  it('does not emit the chat-session debug line when PET_DEBUG="0"', async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    process.env["PET_DEBUG"] = "0";

    await runChatSession({ repoRoot: "/tmp/repo" });

    const wroteResolved = spies.stderr.mock.calls.some((c) => String(c[0]).includes("[pet chat]"));
    expect(wroteResolved).toBe(false);
  });

  it("resolves cleanly when all branches are stubs (returns void)", async () => {
    inputMock.mockResolvedValueOnce("what's pending");

    const result = await runChatSession({ repoRoot: "/tmp/repo" });

    expect(result).toBeUndefined();
  });

  describe("status branch", () => {
    it("invokes runOrchestrate in dry-run mode", async () => {
      inputMock.mockResolvedValueOnce("what's pending");

      await runChatSession({ repoRoot: "/tmp/repo" });

      expect(runOrchestrateMock).toHaveBeenCalledTimes(1);
      expect(runOrchestrateMock).toHaveBeenCalledWith({ dryRun: true });
    });

    it("prints the `Next: pet orchestrate` hint after the orchestrate summary", async () => {
      inputMock.mockResolvedValueOnce("status");

      await runChatSession({ repoRoot: "/tmp/repo" });

      const stdoutWrites = spies.stdout.mock.calls.map((c) => String(c[0]));
      const hint = stdoutWrites.find((s) => s.includes("Next: pet orchestrate"));
      expect(hint).toBeDefined();
    });

    it("does not invoke runOrchestrate when the resolved intent is explore-problem", async () => {
      inputMock.mockResolvedValueOnce("why do users churn");

      await runChatSession({ repoRoot: "/tmp/repo" });

      expect(runOrchestrateMock).not.toHaveBeenCalled();
    });

    it("does not invoke runOrchestrate when the resolved intent is design-solution", async () => {
      inputMock.mockResolvedValueOnce("build the notification feature");

      await runChatSession({ repoRoot: "/tmp/repo" });

      expect(runOrchestrateMock).not.toHaveBeenCalled();
    });

    it("routes the ambiguous-select status choice through the orchestrate dry-run", async () => {
      inputMock.mockResolvedValueOnce("I need to do something important");
      selectMock.mockResolvedValueOnce("status");

      await runChatSession({ repoRoot: "/tmp/repo" });

      expect(runOrchestrateMock).toHaveBeenCalledTimes(1);
      expect(runOrchestrateMock).toHaveBeenCalledWith({ dryRun: true });
    });
  });
});
