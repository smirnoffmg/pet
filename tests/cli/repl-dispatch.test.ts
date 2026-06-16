import { describe, expect, it, vi } from "vitest";

const { runNewMock, runTaskDoneMock } = vi.hoisted(() => ({
  runNewMock: vi.fn().mockResolvedValue(0),
  runTaskDoneMock: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/cli/new-cmd.js", () => ({ runNew: runNewMock }));
vi.mock("@/cli/task-cmd.js", () => ({ runTaskDone: runTaskDoneMock }));

// Import after mock so the module sees the stub
const { dispatchReplCommand } = await import("@/cli/repl-dispatch.js");

describe("dispatchReplCommand — pet new release", () => {
  it("parses --features and multi-word title correctly", async () => {
    runNewMock.mockClear();
    await dispatchReplCommand("pet new release --features FEAT-0001 Release FEAT-0001");
    expect(runNewMock).toHaveBeenCalledWith("release", "Release FEAT-0001", {
      features: "FEAT-0001",
    });
  });

  it("falls back to feature ID as title when no title words follow", async () => {
    runNewMock.mockClear();
    await dispatchReplCommand("pet new release --features FEAT-0001");
    expect(runNewMock).toHaveBeenCalledWith("release", "FEAT-0001", { features: "FEAT-0001" });
  });

  it("returns 1 when --features flag is missing", async () => {
    runNewMock.mockClear();
    const result = await dispatchReplCommand("pet new release My Release");
    expect(result).toBe(1);
    expect(runNewMock).not.toHaveBeenCalled();
  });

  it("returns 1 when --features flag has no value", async () => {
    runNewMock.mockClear();
    const result = await dispatchReplCommand("pet new release --features");
    expect(result).toBe(1);
    expect(runNewMock).not.toHaveBeenCalled();
  });

  it("forwards the exit code from runNew", async () => {
    runNewMock.mockResolvedValueOnce(1);
    const result = await dispatchReplCommand(
      "pet new release --features FEAT-0001 Release FEAT-0001",
    );
    expect(result).toBe(1);
  });
});

describe("dispatchReplCommand — pet task done", () => {
  it("forwards the task id to runTaskDone", async () => {
    runTaskDoneMock.mockClear();
    await dispatchReplCommand("pet task done TASK-0001");
    expect(runTaskDoneMock).toHaveBeenCalledWith("TASK-0001");
  });

  it("returns 1 when no task id is given", async () => {
    runTaskDoneMock.mockClear();
    const result = await dispatchReplCommand("pet task done");
    expect(result).toBe(1);
    expect(runTaskDoneMock).not.toHaveBeenCalled();
  });

  it("returns 1 for unknown task subcommands", async () => {
    runTaskDoneMock.mockClear();
    const result = await dispatchReplCommand("pet task archive TASK-0001");
    expect(result).toBe(1);
    expect(runTaskDoneMock).not.toHaveBeenCalled();
  });
});
