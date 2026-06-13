import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
