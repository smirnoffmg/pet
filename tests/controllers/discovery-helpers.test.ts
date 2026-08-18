import { describe, expect, it } from "vitest";
import { emptySectionNames, featureBodyIsScaffold } from "@/controllers/discovery-helpers.js";

describe("emptySectionNames", () => {
  it("returns [] for a body with all sections filled", () => {
    const body = "# T\n\n## Context\n\nCtx.\n\n## Evidence\n\nEv.\n";
    expect(emptySectionNames(body)).toEqual([]);
  });

  it("names every empty section in order", () => {
    const body = "# T\n\n## Context\n\n## Decision\n\nReal decision.\n\n## Consequences\n";
    expect(emptySectionNames(body)).toEqual(["Context", "Consequences"]);
  });

  it("treats whitespace-only content as empty", () => {
    const body = "# T\n\n## Evidence\n   \n\t\n";
    expect(emptySectionNames(body)).toEqual(["Evidence"]);
  });

  it("returns [] for a title-only body (no sections to report)", () => {
    expect(emptySectionNames("# T\n")).toEqual([]);
    expect(featureBodyIsScaffold("# T\n")).toBe(true);
  });
});
