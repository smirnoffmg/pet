import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok, err } from "neverthrow";

const {
  inputMock,
  selectMock,
  confirmMock,
  scanArtifactsMock,
  allocateNextIdMock,
  writeArtifactMock,
  runDiscoverMock,
  runOrchestrateMock,
} = vi.hoisted(() => ({
  inputMock: vi.fn(),
  selectMock: vi.fn(),
  confirmMock: vi.fn(),
  scanArtifactsMock: vi.fn(),
  allocateNextIdMock: vi.fn(),
  writeArtifactMock: vi.fn(),
  runDiscoverMock: vi.fn(),
  runOrchestrateMock: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
  select: selectMock,
  confirm: confirmMock,
}));

vi.mock("@/store/index.js", () => ({
  scanArtifacts: scanArtifactsMock,
  allocateNextId: allocateNextIdMock,
  writeArtifact: writeArtifactMock,
}));

vi.mock("@/cli/discover-cmd.js", () => ({
  runDiscover: runDiscoverMock,
}));

vi.mock("@/cli/orchestrate-cmd.js", () => ({
  runOrchestrate: runOrchestrateMock,
}));

const { runChatSession } = await import("@/chat/session.js");

function spyOnStreams() {
  return {
    stdout: vi.spyOn(process.stdout, "write").mockReturnValue(true),
    stderr: vi.spyOn(process.stderr, "write").mockReturnValue(true),
  };
}

describe("runChatSession — explore-problem branch", () => {
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    selectMock.mockReset();
    confirmMock.mockReset();
    scanArtifactsMock.mockReset();
    allocateNextIdMock.mockReset();
    writeArtifactMock.mockReset();
    runDiscoverMock.mockReset();
    runOrchestrateMock.mockReset();

    scanArtifactsMock.mockReturnValue(ok([]));
    allocateNextIdMock.mockReturnValue("PROB-0042");
    writeArtifactMock.mockReturnValue(
      ok("/tmp/repo/doc/product/00-problem-hypotheses/0042-why-users-churn.md"),
    );
    runDiscoverMock.mockResolvedValue(0);

    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
  });

  it("offers the derived title in the scaffold confirmation prompt", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(confirmMock).toHaveBeenCalled();
    const firstCall = confirmMock.mock.calls[0]?.[0] as { message: string; default?: boolean };
    expect(firstCall.message).toContain("«Why Users Churn»");
    expect(firstCall.message).toContain("Shall I proceed?");
    expect(firstCall.default).toBe(true);
  });

  it("declining the scaffold confirmation writes no file and skips the controller", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).not.toHaveBeenCalled();
    expect(allocateNextIdMock).not.toHaveBeenCalled();
    expect(runDiscoverMock).not.toHaveBeenCalled();

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain("Okay. Run `pet new hypothesis` whenever you're ready.");
  });

  it("scaffolds a hypothesis and prints the relative path on confirmation", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(allocateNextIdMock).toHaveBeenCalledWith("hypothesis", []);
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
    const writeCall = writeArtifactMock.mock.calls[0];
    expect(writeCall?.[0]).toBe("/tmp/repo/doc");
    expect(writeCall?.[1]).toBe("hypothesis");
    expect(writeCall?.[2]).toMatchObject({ id: "PROB-0042", status: "proposed" });
    expect(writeCall?.[3]).toBe("Why Users Churn");

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain(
      "Created hypothesis at doc/product/00-problem-hypotheses/0042-why-users-churn.md",
    );
  });

  it("invokes runDiscover with the new hypothesis ID when the hand-off is accepted", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runDiscoverMock).toHaveBeenCalledTimes(1);
    expect(runDiscoverMock).toHaveBeenCalledWith({ hypothesis: "PROB-0042" });
  });

  it("skips runDiscover when the hand-off is declined", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runDiscoverMock).not.toHaveBeenCalled();
  });

  it("always prints the `Next: pet discover --hypothesis <id>` hint after scaffolding", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain("Next: pet discover --hypothesis PROB-0042");
  });

  it("reports a scan failure to stderr and writes no artifact", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true);
    scanArtifactsMock.mockReturnValueOnce(err({ message: "boom" }));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).not.toHaveBeenCalled();
    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("Failed to scan artifacts: boom");
  });

  it("reports a write failure to stderr and skips the discover hand-off", async () => {
    inputMock.mockResolvedValueOnce("why do users churn");
    confirmMock.mockResolvedValueOnce(true);
    writeArtifactMock.mockReturnValueOnce(err({ message: "disk full" }));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runDiscoverMock).not.toHaveBeenCalled();
    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("Failed to write hypothesis: disk full");
  });
});
