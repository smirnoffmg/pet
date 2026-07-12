import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("deepagents", () => ({
  createDeepAgent: vi.fn(),
  FilesystemBackend: vi.fn(),
}));

vi.mock("@/llm/provider-factory.js", () => ({
  createModel: vi.fn(),
}));

import { createDeepAgent } from "deepagents";
import { createModel } from "@/llm/provider-factory.js";
import { createMockOrchestratorAgent } from "@/agents/mock-orchestrator.js";
import { createLogger } from "@/log.js";

const logger = createLogger({ verbose: false });

describe("createMockOrchestratorAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never touches createDeepAgent or createModel", async () => {
    const agent = createMockOrchestratorAgent("/repo/doc", logger);
    await agent.invoke({ messages: [{ role: "user", content: "hello" }] });

    expect(createDeepAgent).not.toHaveBeenCalled();
    expect(createModel).not.toHaveBeenCalled();
  });

  it("appends exactly one deterministic ai message to the input messages", async () => {
    const agent = createMockOrchestratorAgent("/repo/doc", logger);
    const input = [{ role: "user" as const, content: "what's pending?" }];

    const result = await agent.invoke({ messages: input });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe(input[0]);
    const reply = result.messages[1] as { type: string; content: string };
    expect(reply.type).toBe("ai");
    expect(typeof reply.content).toBe("string");
    expect(reply.content.length).toBeGreaterThan(0);
  });

  it("never throws", async () => {
    const agent = createMockOrchestratorAgent("/repo/doc", logger);
    await expect(agent.invoke({ messages: [] })).resolves.toBeDefined();
  });
});
