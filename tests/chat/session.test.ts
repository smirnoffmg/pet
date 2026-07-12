import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderConfigError } from "@/errors/index.js";

const { inputMock, createChatOrchestratorAgentMock, runOrchestratorTurnMock } = vi.hoisted(() => ({
  inputMock: vi.fn(),
  createChatOrchestratorAgentMock: vi.fn(),
  runOrchestratorTurnMock: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
}));

vi.mock("@/agents/orchestrator-session.js", () => ({
  createChatOrchestratorAgent: createChatOrchestratorAgentMock,
  runOrchestratorTurn: runOrchestratorTurnMock,
}));

const { runChatSession } = await import("@/chat/session.js");

function exitPromptError(): Error {
  const err = new Error("User force closed the prompt");
  err.name = "ExitPromptError";
  return err;
}

function spyOnStreams() {
  return {
    stdout: vi.spyOn(process.stdout, "write").mockReturnValue(true),
    stderr: vi.spyOn(process.stderr, "write").mockReturnValue(true),
  };
}

const stubAgent = { invoke: vi.fn() };

describe("runChatSession", () => {
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    createChatOrchestratorAgentMock.mockReset();
    runOrchestratorTurnMock.mockReset();
    createChatOrchestratorAgentMock.mockResolvedValue(stubAgent);
    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
  });

  it("prints the welcome line before prompting", async () => {
    inputMock.mockResolvedValueOnce(".exit");

    await runChatSession({ repoRoot: "/tmp/repo" });

    const firstWrite = String(spies.stdout.mock.calls[0]?.[0] ?? "");
    expect(firstWrite).toContain("Welcome to pet chat");
  });

  it("constructs the orchestrator agent exactly once regardless of turn count", async () => {
    inputMock
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second")
      .mockResolvedValueOnce(".exit");
    runOrchestratorTurnMock.mockResolvedValue({ messages: [], reply: "ok" });

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(createChatOrchestratorAgentMock).toHaveBeenCalledTimes(1);
  });

  it("threads the accumulated messages from one turn into the next", async () => {
    inputMock
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second")
      .mockResolvedValueOnce(".exit");
    const firstMessages = [
      { role: "user", content: "first" },
      { type: "ai", content: "reply1" },
    ];
    const secondMessages = [
      ...firstMessages,
      { role: "user", content: "second" },
      { type: "ai", content: "reply2" },
    ];
    runOrchestratorTurnMock
      .mockResolvedValueOnce({ messages: firstMessages, reply: "reply1" })
      .mockResolvedValueOnce({ messages: secondMessages, reply: "reply2" });

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runOrchestratorTurnMock).toHaveBeenNthCalledWith(1, stubAgent, [], "first");
    expect(runOrchestratorTurnMock).toHaveBeenNthCalledWith(2, stubAgent, firstMessages, "second");
  });

  it("prints each turn's reply to stdout", async () => {
    inputMock.mockResolvedValueOnce("hello").mockResolvedValueOnce(".exit");
    runOrchestratorTurnMock.mockResolvedValueOnce({ messages: [], reply: "hi there" });

    await runChatSession({ repoRoot: "/tmp/repo" });

    const wrote = spies.stdout.mock.calls.some((c) => String(c[0]).includes("hi there"));
    expect(wrote).toBe(true);
  });

  it("re-prompts on blank input without calling the agent", async () => {
    inputMock
      .mockResolvedValueOnce("   ")
      .mockResolvedValueOnce("hello")
      .mockResolvedValueOnce(".exit");
    runOrchestratorTurnMock.mockResolvedValueOnce({ messages: [], reply: "hi" });

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runOrchestratorTurnMock).toHaveBeenCalledTimes(1);
    expect(runOrchestratorTurnMock).toHaveBeenCalledWith(stubAgent, [], "hello");
  });

  it.each([".exit", "exit", "QUIT", "Exit"])(
    "ends the loop cleanly on exit sentinel %j without an extra turn call",
    async (sentinel) => {
      inputMock.mockResolvedValueOnce(sentinel);

      const result = await runChatSession({ repoRoot: "/tmp/repo" });

      expect(result).toBeUndefined();
      expect(runOrchestratorTurnMock).not.toHaveBeenCalled();
    },
  );

  it("exits cleanly when Ctrl-C (ExitPromptError) interrupts a prompt", async () => {
    inputMock.mockRejectedValueOnce(exitPromptError());

    await expect(runChatSession({ repoRoot: "/tmp/repo" })).resolves.toBeUndefined();

    expect(runOrchestratorTurnMock).not.toHaveBeenCalled();
  });

  it("prints guidance and exits cleanly when no LLM provider is configured", async () => {
    createChatOrchestratorAgentMock.mockRejectedValueOnce(
      new ProviderConfigError("ANTHROPIC_API_KEY is required when PET_LLM_PROVIDER=anthropic"),
    );

    await expect(runChatSession({ repoRoot: "/tmp/repo" })).resolves.toBeUndefined();

    expect(inputMock).not.toHaveBeenCalled();
    const wroteGuidance = spies.stderr.mock.calls.some((c) =>
      String(c[0]).includes("PET_MOCK_AGENTS=1"),
    );
    expect(wroteGuidance).toBe(true);
  });

  it("rethrows unexpected errors from agent creation", async () => {
    createChatOrchestratorAgentMock.mockRejectedValueOnce(new Error("boom"));

    await expect(runChatSession({ repoRoot: "/tmp/repo" })).rejects.toThrow("boom");
  });
});
