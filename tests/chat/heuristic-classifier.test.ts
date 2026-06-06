import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIntent } from "@/chat/heuristic-classifier.js";

describe("classifyIntent", () => {
  const cases: ReadonlyArray<[string, ReturnType<typeof classifyIntent>]> = [
    ["why do users churn", "explore-problem"],
    ["I want to understand slow CI", "explore-problem"],
    ["build the notification feature", "design-solution"],
    ["ship the auth redesign", "design-solution"],
    ["what's pending", "status"],
    ["next step", "status"],
    ["I need to do something important", "ambiguous"],
  ];

  for (const [input, expected] of cases) {
    it(`classifies ${JSON.stringify(input)} as ${expected}`, () => {
      expect(classifyIntent(input)).toBe(expected);
    });
  }

  it("is case-insensitive (mixed-case input)", () => {
    expect(classifyIntent("WHY is this broken")).toBe("explore-problem");
    expect(classifyIntent("BUILD the dashboard")).toBe("design-solution");
    expect(classifyIntent("STATUS now")).toBe("status");
  });

  it("prefers phrase matches over single-word fallthroughs", () => {
    expect(classifyIntent("what is pending on the design feature")).toBe("status");
    expect(classifyIntent("next step for the build")).toBe("status");
  });

  it("treats keywords as whole-word matches (no substring false positives)", () => {
    expect(classifyIntent("status report please")).toBe("status");
    expect(classifyIntent("statusless review")).toBe("ambiguous");
  });
});

describe("classifyIntent debug logging", () => {
  const originalDebug = process.env["PET_DEBUG"];

  function spyOnStreams() {
    return {
      stderr: vi.spyOn(process.stderr, "write").mockReturnValue(true),
      stdout: vi.spyOn(process.stdout, "write").mockReturnValue(true),
    };
  }

  let spies = spyOnStreams();

  beforeEach(() => {
    spies = spyOnStreams();
  });

  afterEach(() => {
    spies.stderr.mockRestore();
    spies.stdout.mockRestore();
    if (originalDebug === undefined) {
      delete process.env["PET_DEBUG"];
    } else {
      process.env["PET_DEBUG"] = originalDebug;
    }
  });

  it("emits to stderr only when PET_DEBUG=1", () => {
    process.env["PET_DEBUG"] = "1";
    classifyIntent("why is this slow");
    expect(spies.stderr).toHaveBeenCalledTimes(1);
    const firstCall = spies.stderr.mock.calls[0]?.[0];
    expect(typeof firstCall).toBe("string");
    expect(String(firstCall)).toContain("explore-problem");
    expect(spies.stdout).not.toHaveBeenCalled();
  });

  it("does not emit to stderr when PET_DEBUG is unset", () => {
    delete process.env["PET_DEBUG"];
    classifyIntent("ship the redesign");
    expect(spies.stderr).not.toHaveBeenCalled();
    expect(spies.stdout).not.toHaveBeenCalled();
  });

  it('does not emit to stderr when PET_DEBUG="0"', () => {
    process.env["PET_DEBUG"] = "0";
    classifyIntent("ship the redesign");
    expect(spies.stderr).not.toHaveBeenCalled();
    expect(spies.stdout).not.toHaveBeenCalled();
  });
});
