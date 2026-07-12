import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inputMock } = vi.hoisted(() => ({ inputMock: vi.fn() }));

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
}));

const { runChatSession } = await import("@/chat/session.js");

function spyOnStreams() {
  return {
    stdout: vi.spyOn(process.stdout, "write").mockReturnValue(true),
    stderr: vi.spyOn(process.stderr, "write").mockReturnValue(true),
  };
}

const ENV_KEYS = ["PET_MOCK_AGENTS", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PET_LLM_PROVIDER"];

describe("pet chat: PET_MOCK_AGENTS=1 with no LLM provider configured", () => {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    process.env["PET_MOCK_AGENTS"] = "1";
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["PET_LLM_PROVIDER"];
    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("completes a full turn without throwing and without any API key", async () => {
    inputMock.mockResolvedValueOnce("what's pending?").mockResolvedValueOnce(".exit");

    await expect(runChatSession({ repoRoot: "/tmp/pet-mock-chat-test" })).resolves.toBeUndefined();

    const wroteMockReply = spies.stdout.mock.calls.some((c) =>
      String(c[0]).includes("PET_MOCK_AGENTS=1"),
    );
    expect(wroteMockReply).toBe(true);
  });

  it("threads accumulated messages across multiple turns without throwing", async () => {
    inputMock
      .mockResolvedValueOnce("hello")
      .mockResolvedValueOnce("what should I do next?")
      .mockResolvedValueOnce(".exit");

    await expect(runChatSession({ repoRoot: "/tmp/pet-mock-chat-test" })).resolves.toBeUndefined();
  });

  it("exits cleanly on the first prompt with no turns taken", async () => {
    inputMock.mockResolvedValueOnce(".exit");

    await expect(runChatSession({ repoRoot: "/tmp/pet-mock-chat-test" })).resolves.toBeUndefined();
  });
});
