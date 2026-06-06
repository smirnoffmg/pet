import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { executeCommands } from "@/agents/executor.js";
import { createLogger } from "@/log.js";

const noopLogger = createLogger({ verbose: false });
import { metricIdSchema } from "@/schemas/ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureSrc = path.join(__dirname, "..", "fixtures", "doc-discover");

describe("discovery mock executor", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pet-discovery-test-"));
    fs.cpSync(fixtureSrc, fixtureRoot, { recursive: true });
    process.env["PET_MOCK_AGENTS"] = "1";
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("mock analyst creates a hypothesis", async () => {
    await executeCommands(
      fixtureRoot,
      [
        {
          kind: "spawn_analyst",
          brief: {
            metricId: metricIdSchema.parse("MET-0001"),
            metricTitle: "Discovery metric",
            metricBody: "# Discovery metric\n",
          },
        },
      ],
      false,
      noopLogger,
    );
    const files = fs.readdirSync(path.join(fixtureRoot, "product/00-problem-hypotheses"));
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });
});
