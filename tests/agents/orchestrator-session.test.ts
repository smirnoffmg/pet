import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/agents/orchestrator.js", () => ({
  createOrchestratorAgent: vi.fn(),
}));

vi.mock("@/agents/mock-orchestrator.js", () => ({
  createMockOrchestratorAgent: vi.fn(),
}));

import { createOrchestratorAgent } from "@/agents/orchestrator.js";
import { createMockOrchestratorAgent } from "@/agents/mock-orchestrator.js";
import { createChatOrchestratorAgent, runOrchestratorTurn } from "@/agents/orchestrator-session.js";
import { createLogger } from "@/log.js";

const logger = createLogger({ verbose: false });
const ORIGINAL_MOCK_AGENTS = process.env["PET_MOCK_AGENTS"];

afterEach(() => {
  if (ORIGINAL_MOCK_AGENTS === undefined) {
    delete process.env["PET_MOCK_AGENTS"];
  } else {
    process.env["PET_MOCK_AGENTS"] = ORIGINAL_MOCK_AGENTS;
  }
});

describe("createChatOrchestratorAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the mock orchestrator agent when PET_MOCK_AGENTS=1", async () => {
    process.env["PET_MOCK_AGENTS"] = "1";
    const stubAgent = { invoke: vi.fn() };
    vi.mocked(createMockOrchestratorAgent).mockReturnValue(stubAgent);

    const agent = await createChatOrchestratorAgent("/repo/doc", logger);

    expect(createMockOrchestratorAgent).toHaveBeenCalledWith("/repo/doc", logger);
    expect(createOrchestratorAgent).not.toHaveBeenCalled();
    expect(agent).toBe(stubAgent);
  });

  it("delegates to the real orchestrator agent when PET_MOCK_AGENTS is unset", async () => {
    delete process.env["PET_MOCK_AGENTS"];
    const stubInvoke = vi.fn().mockResolvedValue({ messages: [] });
    vi.mocked(createOrchestratorAgent).mockResolvedValue({
      invoke: stubInvoke,
    } as unknown as Awaited<ReturnType<typeof createOrchestratorAgent>>);

    await createChatOrchestratorAgent("/repo/doc", logger);

    expect(createOrchestratorAgent).toHaveBeenCalledWith("/repo/doc", logger);
    expect(createMockOrchestratorAgent).not.toHaveBeenCalled();
  });
});

describe("runOrchestratorTurn", () => {
  it("appends the user turn, invokes the agent with the full accumulated history, and extracts the reply", async () => {
    const priorMessages = [{ role: "user" as const, content: "hi" }];
    const invoke = vi.fn().mockResolvedValue({
      messages: [...priorMessages, { type: "ai", content: "hello there" }],
    });
    const agent = { invoke };

    const result = await runOrchestratorTurn(agent, priorMessages, "what's next?");

    expect(invoke).toHaveBeenCalledWith({
      messages: [...priorMessages, { role: "user", content: "what's next?" }],
    });
    expect(result.reply).toBe("hello there");
    expect(result.messages).toEqual([...priorMessages, { type: "ai", content: "hello there" }]);
  });

  it("falls back to a placeholder reply when no assistant text is found", async () => {
    const invoke = vi.fn().mockResolvedValue({ messages: [] });
    const agent = { invoke };

    const result = await runOrchestratorTurn(agent, [], "hello");

    expect(result.reply).toBe("(no response)");
  });
});
