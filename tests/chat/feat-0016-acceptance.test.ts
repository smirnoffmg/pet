import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";

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

const AMBIGUOUS_INPUT = "I need to do something important";

describe("FEAT-0016 acceptance — ambiguous-path select menu routes each intent", () => {
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

    scanArtifactsMock.mockReturnValue(ok([]));
    allocateNextIdMock.mockReturnValue("PROB-0001");
    writeArtifactMock.mockReturnValue(
      ok("/tmp/repo/doc/product/00-problem-hypotheses/0001-something-important.md"),
    );
    runDiscoverMock.mockResolvedValue(0);
    runDeliverMock.mockResolvedValue(0);
    runOrchestrateMock.mockResolvedValue(0);
    confirmMock.mockResolvedValue(false);

    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
  });

  it("selecting explore-problem from the menu routes to the explore branch (confirmation offered)", async () => {
    inputMock.mockResolvedValueOnce(AMBIGUOUS_INPUT);
    selectMock.mockResolvedValueOnce("explore-problem");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(confirmMock).toHaveBeenCalled();
    const firstConfirm = confirmMock.mock.calls[0]?.[0] as { message: string };
    expect(firstConfirm.message).toContain("I'll create a new hypothesis");
    expect(runOrchestrateMock).not.toHaveBeenCalled();
    expect(runDeliverMock).not.toHaveBeenCalled();
  });

  it("selecting design-solution from the menu routes to the design branch (scan attempted)", async () => {
    inputMock.mockResolvedValueOnce(AMBIGUOUS_INPUT);
    selectMock.mockResolvedValueOnce("design-solution");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(scanArtifactsMock).toHaveBeenCalled();
    expect(runOrchestrateMock).not.toHaveBeenCalled();
    expect(runDiscoverMock).not.toHaveBeenCalled();
  });

  it("selecting status from the menu routes to the status branch (orchestrate dry-run)", async () => {
    inputMock.mockResolvedValueOnce(AMBIGUOUS_INPUT);
    selectMock.mockResolvedValueOnce("status");

    await runChatSession({ repoRoot: "/tmp/repo" });

    expect(runOrchestrateMock).toHaveBeenCalledTimes(1);
    expect(runOrchestrateMock).toHaveBeenCalledWith({ dryRun: true });
    expect(runDiscoverMock).not.toHaveBeenCalled();
    expect(runDeliverMock).not.toHaveBeenCalled();
  });
});

describe("FEAT-0016 acceptance — status flow", () => {
  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    selectMock.mockReset();
    confirmMock.mockReset();
    runOrchestrateMock.mockReset();

    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();
  });

  it("relays runOrchestrate's pending output and then prints the `Next: pet orchestrate` hint", async () => {
    inputMock.mockResolvedValueOnce("what's pending");
    runOrchestrateMock.mockImplementation(async () => {
      process.stdout.write("spawn_researcher --hypothesis PROB-0001\n");
      process.stdout.write("(dry-run: no agents executed)\n");
      return 0;
    });

    await runChatSession({ repoRoot: "/tmp/repo" });

    const stdoutText = spies.stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(stdoutText).toContain("spawn_researcher --hypothesis PROB-0001");
    expect(stdoutText).toContain("(dry-run: no agents executed)");

    const hintIndex = stdoutText.indexOf("Next: pet orchestrate");
    const summaryIndex = stdoutText.indexOf("spawn_researcher");
    expect(hintIndex).toBeGreaterThan(-1);
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(summaryIndex);
  });
});

describe("FEAT-0016 acceptance — PET_MOCK_AGENTS=1 with no API key", () => {
  const originalMock = process.env["PET_MOCK_AGENTS"];
  const originalAnthropic = process.env["ANTHROPIC_API_KEY"];
  const originalOpenAI = process.env["OPENAI_API_KEY"];

  let spies = spyOnStreams();

  beforeEach(() => {
    inputMock.mockReset();
    selectMock.mockReset();
    confirmMock.mockReset();
    runOrchestrateMock.mockReset();
    runOrchestrateMock.mockResolvedValue(0);

    process.env["PET_MOCK_AGENTS"] = "1";
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];

    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stdout.mockRestore();
    spies.stderr.mockRestore();

    if (originalMock === undefined) {
      delete process.env["PET_MOCK_AGENTS"];
    } else {
      process.env["PET_MOCK_AGENTS"] = originalMock;
    }
    if (originalAnthropic === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = originalAnthropic;
    }
    if (originalOpenAI === undefined) {
      delete process.env["OPENAI_API_KEY"];
    } else {
      process.env["OPENAI_API_KEY"] = originalOpenAI;
    }
  });

  it("status flow completes without throwing when no API key is configured", async () => {
    inputMock.mockResolvedValueOnce("what's pending");

    await expect(runChatSession({ repoRoot: "/tmp/repo" })).resolves.toBeUndefined();

    expect(runOrchestrateMock).toHaveBeenCalledTimes(1);
    expect(runOrchestrateMock).toHaveBeenCalledWith({ dryRun: true });
  });
});
