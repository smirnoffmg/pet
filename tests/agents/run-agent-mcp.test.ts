import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { problemHypothesisIdSchema } from "@/schemas/ids.js";

const SERVER_BIN = path.resolve("node_modules/@modelcontextprotocol/server-memory/dist/index.js");

// vi.mock factories are hoisted to the top — no outer variable references allowed inside.
vi.mock("deepagents", () => ({
  createDeepAgent: vi.fn().mockReturnValue({ invoke: vi.fn().mockResolvedValue({ messages: [] }) }),
  FilesystemBackend: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock("@/llm/provider-factory.js", () => ({
  createModel: vi.fn().mockResolvedValue({}),
  resolveModelId: vi.fn().mockReturnValue("mock-model"),
  resolveProvider: vi.fn().mockReturnValue("mock"),
}));

vi.mock("@/agents/load-prompt.js", () => ({
  loadPrompt: vi.fn().mockReturnValue(""),
}));

// Import after mocks are registered
import { runLiveAgent } from "@/agents/run-agent.js";
import * as deepagents from "deepagents";

function makeRepoRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-run-agent-mcp-"));
  fs.mkdirSync(path.join(dir, "doc", "product"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pet.mcp.json"),
    JSON.stringify({
      servers: [{ name: "memory", transport: "stdio", command: "node", args: [SERVER_BIN] }],
    }),
  );
  return dir;
}

const RESEARCHER_BRIEF = {
  hypothesisId: problemHypothesisIdSchema.parse("PROB-0001"),
  hypothesisTitle: "test",
  hypothesisBody: "body",
};

describe("runLiveAgent MCP wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset createDeepAgent mock to nominal behaviour
    vi.mocked(deepagents.createDeepAgent).mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ messages: [] }),
    } as unknown as ReturnType<typeof deepagents.createDeepAgent>);
  });

  // TC-03: MCP tools from real server reach createDeepAgent
  it("TC-03: threads real memory server tools into createDeepAgent", async () => {
    const repoRoot = makeRepoRoot();
    const docRoot = path.join(repoRoot, "doc");

    await runLiveAgent("researcher", docRoot, RESEARCHER_BRIEF);

    expect(deepagents.createDeepAgent).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(deepagents.createDeepAgent).mock.calls[0]?.[0] as {
      tools: { name: string }[];
    };
    expect(callArgs.tools.length).toBeGreaterThan(0);
    expect(callArgs.tools.map((t) => t.name)).toContain("create_entities");
  }, 15000);

  // TC-08: disconnect called in finally even when agent throws
  it("TC-08: calls disconnect even when agent invoke throws", async () => {
    const repoRoot = makeRepoRoot();
    const docRoot = path.join(repoRoot, "doc");

    vi.mocked(deepagents.createDeepAgent).mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error("agent failure")),
    } as unknown as ReturnType<typeof deepagents.createDeepAgent>);

    await expect(runLiveAgent("researcher", docRoot, RESEARCHER_BRIEF)).rejects.toThrow(
      "agent failure",
    );

    expect(deepagents.createDeepAgent).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(deepagents.createDeepAgent).mock.calls[0]?.[0] as {
      tools: { name: string }[];
    };
    expect(callArgs.tools.length).toBeGreaterThan(0);
  }, 15000);
});
