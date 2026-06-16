import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMcpTools, validateMcpConfig } from "@/llm/mcp-tools.js";
import * as pathPerms from "@/agents/path-permissions.js";

vi.mock("@langchain/mcp-adapters", () => {
  const closeSpy = vi.fn().mockResolvedValue(undefined);
  const getToolsSpy = vi.fn().mockResolvedValue([{ name: "fake-tool" }]);
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
