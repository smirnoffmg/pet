import { describe, expect, it, vi } from "vitest";
import { AGENTS_GUIDE, runAgents } from "@/cli/agents-cmd.js";

describe("pet agents", () => {
  it("prints the guide and exits 0", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runAgents()).toBe(0);
    expect(log).toHaveBeenCalledWith(AGENTS_GUIDE);
    log.mockRestore();
  });

  it("covers the rules an agent must not break", () => {
    expect(AGENTS_GUIDE).toContain("pet next");
    expect(AGENTS_GUIDE).toContain("pet validate");
    expect(AGENTS_GUIDE).toContain("supersede");
    expect(AGENTS_GUIDE).toContain("pet task done");
    expect(AGENTS_GUIDE).toContain("--dry-run");
    expect(AGENTS_GUIDE).toContain("never by file path");
  });
});
