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
  runDeliverMock,
  runOrchestrateMock,
} = vi.hoisted(() => ({
  inputMock: vi.fn(),
  selectMock: vi.fn(),
  confirmMock: vi.fn(),
  scanArtifactsMock: vi.fn(),
  allocateNextIdMock: vi.fn(),
  writeArtifactMock: vi.fn(),
  runDiscoverMock: vi.fn(),
  runDeliverMock: vi.fn(),
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

vi.mock("@/cli/deliver-cmd.js", () => ({
  runDeliver: runDeliverMock,
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

function hypothesisArtifact(id: string) {
  return {
    kind: "hypothesis" as const,
    filePath: `/tmp/repo/doc/product/00-problem-hypotheses/${id.toLowerCase()}.md`,
    relativePath: `product/00-problem-hypotheses/${id.toLowerCase()}.md`,
    frontmatter: { id, status: "accepted" } as never,
    body: `# ${id}\n`,
  };
}

function metricArtifact(id: string) {
  return {
    kind: "metric" as const,
    filePath: `/tmp/repo/doc/product/01-metrics/${id.toLowerCase()}.md`,
    relativePath: `product/01-metrics/${id.toLowerCase()}.md`,
    frontmatter: { id, status: "accepted" } as never,
    body: `# ${id}\n`,
  };
}

function solutionArtifact(id: string, status: "proposed" | "accepted", title: string) {
  return {
    kind: "solution_hypothesis" as const,
    filePath: `/tmp/repo/doc/product/02-solution-hypotheses/${id.toLowerCase()}.md`,
    relativePath: `product/02-solution-hypotheses/${id.toLowerCase()}.md`,
    frontmatter: {
      id,
      status,
      problem_hypothesis_id: "PROB-0001",
      target_metric_id: "MET-0001",
    } as never,
    body: `# ${title}\n\n## Context\n`,
  };
}

describe("runChatSession — design-solution branch", () => {
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    selectMock.mockReset();
    confirmMock.mockReset();
    scanArtifactsMock.mockReset();
    allocateNextIdMock.mockReset();
    writeArtifactMock.mockReset();
    runDiscoverMock.mockReset();
    runDeliverMock.mockReset();
    runOrchestrateMock.mockReset();

    allocateNextIdMock.mockReturnValue("SOL-0099");
    writeArtifactMock.mockReturnValue(
      ok("/tmp/repo/doc/product/02-solution-hypotheses/0099-notification-feature.md"),
    );
    runDeliverMock.mockResolvedValue(0);

    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
  });

  it("offers the existing proposed solution when one is found", async () => {
    inputMock.mockResolvedValueOnce("ship the auth redesign");
    scanArtifactsMock.mockReturnValue(
      ok([solutionArtifact("SOL-0042", "proposed", "Auth Redesign Plan")]),
    );
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(confirmMock).toHaveBeenCalled();
    const firstCall = confirmMock.mock.calls[0]?.[0] as { message: string; default?: boolean };
    expect(firstCall.message).toContain("SOL-0042");
    expect(firstCall.message).toContain("«Auth Redesign Plan»");
    expect(firstCall.message).toContain("Use this one?");
    expect(firstCall.default).toBe(true);

    expect(writeArtifactMock).not.toHaveBeenCalled();
    expect(allocateNextIdMock).not.toHaveBeenCalled();

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain(
      "Using solution-hypothesis at doc/product/02-solution-hypotheses/sol-0042.md",
    );
    expect(stdoutText).toContain("Next: pet deliver --solution SOL-0042");
  });

  it("scaffolds a new solution-hypothesis when none exists and the deliver hand-off is accepted", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(
      ok([hypothesisArtifact("PROB-0007"), metricArtifact("MET-0003")]),
    );
    selectMock.mockResolvedValueOnce("MET-0003");
    confirmMock.mockResolvedValueOnce(true);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(allocateNextIdMock).toHaveBeenCalledWith("solution_hypothesis", expect.any(Array));
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
    const writeCall = writeArtifactMock.mock.calls[0];
    expect(writeCall?.[0]).toBe("/tmp/repo/doc");
    expect(writeCall?.[1]).toBe("solution_hypothesis");
    expect(writeCall?.[2]).toMatchObject({
      id: "SOL-0099",
      status: "proposed",
      metric_ids: ["MET-0003"],
    });
    expect(writeCall?.[3]).toBe("Build Notification Feature");

    expect(runDeliverMock).toHaveBeenCalledTimes(1);
    expect(runDeliverMock).toHaveBeenCalledWith({ feature: "SOL-0099" });

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain(
      "Using solution-hypothesis at doc/product/02-solution-hypotheses/0099-notification-feature.md",
    );
    expect(stdoutText).toContain("Next: pet deliver --solution SOL-0099");
  });

  it("scaffolds when the user declines the existing proposed entry", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(
      ok([
        solutionArtifact("SOL-0042", "proposed", "Auth Redesign Plan"),
        hypothesisArtifact("PROB-0007"),
        metricArtifact("MET-0003"),
      ]),
    );
    confirmMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    selectMock.mockResolvedValueOnce("MET-0003");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
    expect(runDeliverMock).not.toHaveBeenCalled();
  });

  it("skips runDeliver when the hand-off is declined", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(
      ok([hypothesisArtifact("PROB-0007"), metricArtifact("MET-0003")]),
    );
    selectMock.mockResolvedValueOnce("MET-0003");
    confirmMock.mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
    expect(runDeliverMock).not.toHaveBeenCalled();

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain("Next: pet deliver --solution SOL-0099");
  });

  it("reports a missing-hypothesis error when scaffolding has no hypotheses", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(ok([metricArtifact("MET-0003")]));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).not.toHaveBeenCalled();
    expect(runDeliverMock).not.toHaveBeenCalled();

    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("No hypotheses found");
  });

  it("reports a missing-metric error when scaffolding has no metrics", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(ok([hypothesisArtifact("PROB-0007")]));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).not.toHaveBeenCalled();
    expect(runDeliverMock).not.toHaveBeenCalled();

    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("No metrics found");
  });

  it("reports a scan failure to stderr and writes no artifact", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValueOnce(err({ message: "boom" }));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).not.toHaveBeenCalled();
    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("Failed to scan artifacts: boom");
  });

  it("reports a write failure to stderr and skips the deliver hand-off", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(
      ok([hypothesisArtifact("PROB-0007"), metricArtifact("MET-0003")]),
    );
    selectMock.mockResolvedValueOnce("MET-0003");
    writeArtifactMock.mockReturnValueOnce(err({ message: "disk full" }));

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runDeliverMock).not.toHaveBeenCalled();
    const stderrText = spies.stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrText).toContain("Failed to write solution-hypothesis: disk full");
  });

  it("skips the existing-entry offer when the only candidate is accepted", async () => {
    inputMock.mockResolvedValueOnce("build the notification feature");
    scanArtifactsMock.mockReturnValue(
      ok([
        solutionArtifact("SOL-0010", "accepted", "Already Accepted"),
        hypothesisArtifact("PROB-0007"),
        metricArtifact("MET-0003"),
      ]),
    );
    selectMock.mockResolvedValueOnce("MET-0003");
    confirmMock.mockResolvedValueOnce(false);

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
    const allConfirmMessages = confirmMock.mock.calls.map(
      (c) => (c[0] as { message: string }).message,
    );
    expect(allConfirmMessages.some((m) => m.includes("Use this one?"))).toBe(false);
  });
});
