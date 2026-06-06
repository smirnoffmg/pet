import { describe, expect, it } from "vitest";
import { buildFilename, titleToSlug, numericSuffixFromFilename } from "@/store/slug.js";

describe("slug", () => {
  it("converts title to kebab-case", () => {
    expect(titleToSlug("CLI Validate + New!")).toBe("cli-validate-new");
  });

  it("builds filename with padded numeric prefix", () => {
    expect(buildFilename(7, "Onboarding Tooltips")).toBe("0007-onboarding-tooltips.md");
  });

  it("extracts numeric suffix from filename", () => {
    expect(numericSuffixFromFilename("0042-tooltip-component.md")).toBe(42);
  });
});
