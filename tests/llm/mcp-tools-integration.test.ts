import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadMcpTools } from "@/llm/mcp-tools.js";
import * as pathPerms from "@/agents/path-permissions.js";

const SERVER_BIN = path.resolve("node_modules/@modelcontextprotocol/server-memory/dist/index.js");

function makeMemoryConfig(repoRoot: string): void {
  fs.writeFileSync(
    path.join(repoRoot, "pet.mcp.json"),
    JSON.stringify({
      servers: [{ name: "memory", transport: "stdio", command: "node", args: [SERVER_BIN] }],
    }),
  );
}

// Stands in for a real remote MCP server: an actual TCP/HTTP listener rather
// than the stdio child-process pattern used above, exercising the same code
// path a hosted MCP endpoint would.
function buildPingServer(): McpServer {
  const server = new McpServer({ name: "test-http-server", version: "1.0.0" });
  server.registerTool("ping", { description: "Replies pong" }, async () => ({
    content: [{ type: "text" as const, text: "pong" }],
  }));
  return server;
}

async function startHttpMcpServer(
  opts: { requiredAuthHeader?: string } = {},
): Promise<{ url: string; close: () => Promise<void> }> {
  const mcpServer = buildPingServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  // StreamableHTTPServerTransport's `onclose` accessor is typed `(() => void) | undefined`
  // rather than the optional `onclose?: () => void` on `Transport`; under our
  // exactOptionalPropertyTypes these are structurally distinct even though both
  // satisfy the interface at runtime. Cast bridges an SDK typing quirk, not our logic.
  await mcpServer.connect(transport as Parameters<typeof mcpServer.connect>[0]);

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (opts.requiredAuthHeader && req.headers.authorization !== opts.requiredAuthHeader) {
      res.writeHead(401).end();
      return;
    }
    void transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to bind test HTTP MCP server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await transport.close();
      await mcpServer.close();
    },
  };
}

// TC-02: real server — verify tools are returned and have expected names
describe("loadMcpTools (real memory server)", () => {
  it("TC-02: returns real tools from memory server for allow-listed role", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-integration-"));
    makeMemoryConfig(dir);

    const { tools, disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
    try {
      expect(tools.length).toBeGreaterThan(0);
      const names = tools.map((t) => t.name);
      expect(names).toContain("create_entities");
      expect(names).toContain("search_nodes");
      expect(names).toContain("add_observations");
    } finally {
      await disconnect();
    }
  }, 15000);

  it("returns empty tools when role is not allow-listed (qa)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-integration-"));
    makeMemoryConfig(dir);
    // qa has no allow-list — server should not be spawned
    const { tools, disconnect } = (await loadMcpTools("qa", dir))._unsafeUnwrap();
    expect(tools).toHaveLength(0);
    await disconnect();
  }, 5000);

  it("filters to only allow-listed server names", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-integration-"));
    // Config has two servers; role only allow-lists "memory"
    fs.writeFileSync(
      path.join(dir, "pet.mcp.json"),
      JSON.stringify({
        servers: [
          { name: "memory", transport: "stdio", command: "node", args: [SERVER_BIN] },
          { name: "other", transport: "stdio", command: "node", args: [SERVER_BIN] },
        ],
      }),
    );
    const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["memory"]);
    try {
      const { tools, disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
      expect(tools.length).toBeGreaterThan(0);
      await disconnect();
    } finally {
      spy.mockRestore();
    }
  }, 15000);
});

// TC-11/TC-12: real remote server over Streamable HTTP — the recommended
// transport for hosted MCP servers (SSE is kept only for legacy compatibility).
describe("loadMcpTools (real Streamable HTTP server)", () => {
  it("TC-11: returns real tools from a remote Streamable HTTP server", async () => {
    const { url, close } = await startHttpMcpServer();
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-http-integration-"));
      fs.writeFileSync(
        path.join(dir, "pet.mcp.json"),
        JSON.stringify({ servers: [{ name: "remote-http", transport: "http", url }] }),
      );
      const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-http"]);
      try {
        const { tools, disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
        expect(tools.map((t) => t.name)).toContain("ping");
        await disconnect();
      } finally {
        spy.mockRestore();
      }
    } finally {
      await close();
    }
  }, 15000);

  it("TC-12: sends configured headers to an auth-gated remote HTTP server", async () => {
    const { url, close } = await startHttpMcpServer({ requiredAuthHeader: "Bearer test-token" });
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-http-integration-"));
      fs.writeFileSync(
        path.join(dir, "pet.mcp.json"),
        JSON.stringify({
          servers: [
            {
              name: "remote-http",
              transport: "http",
              url,
              headers: { Authorization: "Bearer test-token" },
            },
          ],
        }),
      );
      const spy = vi.spyOn(pathPerms, "mcpServersForRole").mockReturnValue(["remote-http"]);
      try {
        const { tools, disconnect } = (await loadMcpTools("researcher", dir))._unsafeUnwrap();
        expect(tools.map((t) => t.name)).toContain("ping");
        await disconnect();
      } finally {
        spy.mockRestore();
      }
    } finally {
      await close();
    }
  }, 15000);
});
