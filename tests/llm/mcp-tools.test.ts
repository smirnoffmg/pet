import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMcpTools, validateMcpConfig } from "@/llm/mcp-tools.js";
import * as pathPerms from "@/agents/path-permissions.js";

vi.mock("@langchain/mcp-adapters", () => {
  const closeSpy = vi.fn().mockResolvedValue(undefined);
  const getToolsSpy = vi.fn().mockResolvedValue([{ name: "fake-tool", invoke: vi.fn() }]);
  const constructorSpy = vi.fn().mockImplementation(function (config: unknown) {
    return { _config: config, getTools: getToolsSpy, close: closeSpy };
  });
  return { MultiServerMCPClient: constructorSpy };
});

function withMcpConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-test-"));
  fs.writeFileSync(path.join(dir, "pet.mcp.json"), content);
  return dir;
}

function withoutMcpConfig(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-test-"));
}

const VALID_CONFIG = JSON.stringify({
  servers: [
    { name: "web-search", transport: "stdio", command: "npx", args: ["-y", "search-mcp"] },
    { name: "remote-api", transport: "sse", url: "http://localhost:3100/sse" },
  ],
});

describe("loadMcpTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty tools when role has no mcpServers allow-list", async () => {
    const dir = withoutMcpConfig();
    // qa has an empty allow-list
    const result = await loadMcpTools("qa", dir);
    const { tools, disconnect } = result._unsafeUnwrap();
    expect(tools).toHaveLength(0);
    await disconnect();
  });

  it("returns empty tools when pet.mcp.json is absent even if role has allow-list", async () => {
    const dir = withoutMcpConfig();
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    // researcher has ["memory"] but no config file → early exit
    const result = await loadMcpTools("researcher", dir);
    const { tools, disconnect } = result._unsafeUnwrap();
    expect(tools).toHaveLength(0);
    expect(MultiServerMCPClient).not.toHaveBeenCalled();
    await disconnect();
  });

  it("returns Err on malformed JSON in pet.mcp.json when role has allow-list", async () => {
    const dir = withMcpConfig(`{ "servers": [`);
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["web-search"]);
    try {
      const result = await loadMcpTools("researcher", dir);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/invalid JSON/i);
    } finally {
      spy.mockRestore();
    }
  });

  // TC-06: stdio config shape passed to MultiServerMCPClient
  it("TC-06: passes correct stdio config shape to MultiServerMCPClient", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "my-server",
            transport: "stdio",
            command: "npx",
            args: ["-y", "my-pkg"],
            env: { API_KEY: "test" },
          },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["my-server"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      expect(MultiServerMCPClient).toHaveBeenCalledOnce();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "my-server"
      ];
      expect(serverEntry).toMatchObject({
        transport: "stdio",
        command: "npx",
        args: ["-y", "my-pkg"],
        env: { API_KEY: "test" },
      });
      expect(serverEntry).not.toHaveProperty("url");
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });

  // TC-07: SSE config shape — url only, no command/args/env
  it("TC-07: passes correct SSE config shape to MultiServerMCPClient", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [{ name: "remote", transport: "sse", url: "https://example.com/mcp" }],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      expect(MultiServerMCPClient).toHaveBeenCalledOnce();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "remote"
      ];
      expect(serverEntry).toMatchObject({
        transport: "sse",
        url: "https://example.com/mcp",
      });
      expect(serverEntry).not.toHaveProperty("command");
      expect(serverEntry).not.toHaveProperty("args");
      expect(serverEntry).not.toHaveProperty("env");
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });

  // TC-09: Streamable HTTP config shape — the modern remote transport, with auth headers
  it("TC-09: passes correct Streamable HTTP config shape to MultiServerMCPClient", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "remote-http",
            transport: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer test-token" },
          },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-http"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      expect(MultiServerMCPClient).toHaveBeenCalledOnce();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "remote-http"
      ];
      expect(serverEntry).toMatchObject({
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer test-token" },
      });
      expect(serverEntry).not.toHaveProperty("command");
      expect(serverEntry).not.toHaveProperty("args");
      expect(serverEntry).not.toHaveProperty("env");
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });

  // TC-13: a server's `tools` allow-list gates its tools; servers without one are untouched
  it("TC-13: applies the per-server tools allow-list, leaving other servers whole", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "jira",
            transport: "http",
            url: "https://example.com/mcp",
            tools: ["jira_get_*", "jira_search"],
          },
          { name: "memory", transport: "stdio", command: "node" },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["jira", "memory"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const getTools = vi.fn().mockResolvedValue([
      { name: "jira-jira_get_issue", invoke: vi.fn() },
      { name: "jira-jira_search", invoke: vi.fn() },
      { name: "jira-jira_search_fields", invoke: vi.fn() },
      { name: "jira-jira_create_issue", invoke: vi.fn() },
      { name: "jira-jira_link_to_epic", invoke: vi.fn() },
      { name: "memory-create_entities", invoke: vi.fn() },
    ]);
    (MultiServerMCPClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { getTools, close: vi.fn().mockResolvedValue(undefined) };
    });
    try {
      const { tools, disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      expect(tools.map((t) => t.name)).toEqual([
        "jira-jira_get_issue",
        "jira-jira_search",
        "memory-create_entities",
      ]);
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });

  // TC-14: `roles` in the config replaces the built-in role wiring
  it("TC-14: selects servers by the config's roles field, not the built-in map", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "jira",
            transport: "http",
            url: "https://example.com/mcp",
            roles: ["solution_designer"],
          },
        ],
      }),
    );
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    // solution_designer has an empty built-in allow-list, so this can only work
    // if the config's own `roles` is what decides.
    const { tools, disconnect } = (await loadMcpTools("solution_designer", dir))._unsafeUnwrap();
    expect(MultiServerMCPClient).toHaveBeenCalledOnce();
    expect(tools).toHaveLength(1);
    await disconnect();

    const forQa = (await loadMcpTools("qa", dir))._unsafeUnwrap();
    expect(forQa.tools).toHaveLength(0);
  });

  // TC-15: an unknown role name is a config error rather than a silently dead server
  it("TC-15: rejects an unknown role name in pet.mcp.json", () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "jira",
            transport: "http",
            url: "https://example.com/mcp",
            roles: ["reasearcher"],
          },
        ],
      }),
    );
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toMatch(/roles/);
  });

  // TC-16: a 429 from a server is transient — retry it rather than losing the source
  it("TC-16: retries a rate-limited tool call and returns its eventual result", async () => {
    vi.useFakeTimers();
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [{ name: "confluence", transport: "http", url: "https://example.com/mcp" }],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["confluence"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("429 Client Error: Too Many Requests for url: /user/current"),
      )
      .mockResolvedValueOnce("page body");
    const getTools = vi
      .fn()
      .mockResolvedValue([{ name: "confluence-confluence_get_page", invoke }]);
    (MultiServerMCPClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { getTools, close: vi.fn().mockResolvedValue(undefined) };
    });
    try {
      const { tools } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      const call = tools[0]!.invoke({});
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(call).resolves.toBe("page body");
      expect(invoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  // TC-19: timeoutMs reaches the client as defaultToolTimeout
  it("TC-19: passes timeoutMs through as defaultToolTimeout", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          { name: "jira", transport: "http", url: "https://example.com/mcp", timeoutMs: 180000 },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["jira"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "jira"
      ];
      expect(serverEntry).toMatchObject({ defaultToolTimeout: 180000 });
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });

  // TC-18: a connect-time timeout is transient too — getTools gets another try
  it("TC-18: retries getTools when the server times out while connecting", async () => {
    vi.useFakeTimers();
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [{ name: "jira", transport: "http", url: "https://example.com/mcp" }],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["jira"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const getTools = vi
      .fn()
      .mockRejectedValueOnce(new Error("MCP error -32001: Request timed out"))
      .mockResolvedValueOnce([{ name: "jira-jira_get_issue", invoke: vi.fn() }]);
    (MultiServerMCPClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { getTools, close: vi.fn().mockResolvedValue(undefined) };
    });
    try {
      const load = loadMcpTools("researcher", dir);
      await vi.advanceTimersByTimeAsync(1_000);
      const { tools } = (await load)._unsafeUnwrap();
      expect(tools).toHaveLength(1);
      expect(getTools).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  // TC-20: a spent-retries failure reaches the agent as a result, not a rejection
  it("TC-20: reports an exhausted tool failure as a tool result", async () => {
    vi.useFakeTimers();
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [{ name: "jira", transport: "http", url: "https://example.com/mcp" }],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["jira"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const invoke = vi.fn().mockRejectedValue(new Error("MCP error -32001: TimeoutError"));
    const getTools = vi.fn().mockResolvedValue([{ name: "jira-jira_search", invoke }]);
    (MultiServerMCPClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { getTools, close: vi.fn().mockResolvedValue(undefined) };
    });
    try {
      const { tools } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      const call = tools[0]!.invoke({});
      await vi.advanceTimersByTimeAsync(13_000);
      await expect(call).resolves.toMatch(/jira-jira_search failed.*TimeoutError/s);
      expect(invoke).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  // TC-17: a non-rate-limit failure is not retried, only reported
  it("TC-17: does not retry a tool error that is not a rate limit", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [{ name: "confluence", transport: "http", url: "https://example.com/mcp" }],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["confluence"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    const invoke = vi.fn().mockRejectedValue(new Error("404 Not Found"));
    const getTools = vi
      .fn()
      .mockResolvedValue([{ name: "confluence-confluence_get_page", invoke }]);
    (MultiServerMCPClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return { getTools, close: vi.fn().mockResolvedValue(undefined) };
    });
    try {
      const { tools } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      await expect(tools[0]!.invoke({})).resolves.toMatch(/404 Not Found/);
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  // TC-11: ${VAR} placeholders in headers are resolved from the environment
  it("TC-11: expands ${VAR} placeholders in headers from process.env", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "remote-http",
            transport: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer ${PET_TEST_TOKEN}" },
          },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-http"]);
    vi.stubEnv("PET_TEST_TOKEN", "resolved-secret");
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "remote-http"
      ];
      expect(serverEntry).toMatchObject({
        headers: { Authorization: "Bearer resolved-secret" },
      });
      await disconnect();
    } finally {
      vi.unstubAllEnvs();
      spy.mockRestore();
    }
  });

  // TC-12: an unset ${VAR} is a config error, not a silently broken auth header
  it("TC-12: returns Err naming the unset environment variable", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "remote-http",
            transport: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer ${PET_ABSENT_TOKEN}" },
          },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-http"]);
    try {
      const result = await loadMcpTools("researcher", dir);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/PET_ABSENT_TOKEN/);
    } finally {
      spy.mockRestore();
    }
  });

  // TC-10: headers are also forwarded for the legacy SSE transport, not just stdio's env
  it("TC-10: forwards headers for SSE transport when configured", async () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "remote-sse",
            transport: "sse",
            url: "https://example.com/sse",
            headers: { "X-Api-Key": "secret" },
          },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-sse"]);
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
    try {
      const { disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      const constructorArg = (MultiServerMCPClient as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const serverEntry = (constructorArg as { mcpServers: Record<string, unknown> }).mcpServers[
        "remote-sse"
      ];
      expect(serverEntry).toMatchObject({
        transport: "sse",
        url: "https://example.com/sse",
        headers: { "X-Api-Key": "secret" },
      });
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("validateMcpConfig", () => {
  it("returns no errors when pet.mcp.json is absent", () => {
    const dir = withoutMcpConfig();
    expect(validateMcpConfig(dir)).toEqual([]);
  });

  it("returns no errors for a valid config", () => {
    const dir = withMcpConfig(VALID_CONFIG);
    expect(validateMcpConfig(dir)).toEqual([]);
  });

  it("returns error for malformed JSON", () => {
    const dir = withMcpConfig(`{ bad`);
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/invalid JSON/i);
  });

  it("returns error for missing required field (command on stdio transport)", () => {
    const dir = withMcpConfig(JSON.stringify({ servers: [{ name: "x", transport: "stdio" }] }));
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns error for duplicate server names", () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          { name: "web-search", transport: "stdio", command: "npx" },
          { name: "web-search", transport: "sse", url: "http://localhost:3100/sse" },
        ],
      }),
    );
    const errors = validateMcpConfig(dir);
    expect(errors.some((e) => e.includes('duplicate server name "web-search"'))).toBe(true);
  });

  it("returns error for invalid SSE URL", () => {
    const dir = withMcpConfig(
      JSON.stringify({ servers: [{ name: "bad", transport: "sse", url: "not-a-url" }] }),
    );
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns no errors for a valid Streamable HTTP config with headers", () => {
    const dir = withMcpConfig(
      JSON.stringify({
        servers: [
          {
            name: "remote-http",
            transport: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer t" },
          },
        ],
      }),
    );
    expect(validateMcpConfig(dir)).toEqual([]);
  });

  it("returns error for invalid Streamable HTTP URL", () => {
    const dir = withMcpConfig(
      JSON.stringify({ servers: [{ name: "bad", transport: "http", url: "not-a-url" }] }),
    );
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns error for missing required field (url on http transport)", () => {
    const dir = withMcpConfig(JSON.stringify({ servers: [{ name: "bad", transport: "http" }] }));
    const errors = validateMcpConfig(dir);
    expect(errors.length).toBeGreaterThan(0);
  });
});
