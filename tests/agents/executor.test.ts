import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { executeCommands } from "@/agents/executor.js";
import { createLogger } from "@/log.js";

const noopLogger = createLogger({ verbose: false });
import { featureIdSchema, solutionHypothesisIdSchema, taskIdSchema } from "@/schemas/ids.js";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureSrc = path.join(__dirname, "..", "fixtures", "doc-deliver");

describe("executeCommands mock", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pet-executor-test-"));
    fs.cpSync(fixtureSrc, fixtureRoot, { recursive: true });

    process.env["PET_MOCK_AGENTS"] = "1";
    fs.mkdirSync(path.join(fixtureRoot, "product/03-features"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "product/04-tasks"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "product/00-problem-hypotheses"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "product/01-metrics"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "adr"), { recursive: true });

    fs.writeFileSync(
      path.join(fixtureRoot, "product/01-metrics/0001-m.md"),
      matter.stringify("# M\n", { id: "MET-0001", status: "accepted" }),
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "product/00-problem-hypotheses/0001-h.md"),
      matter.stringify("# H\n", {
        id: "PROB-0001",
        status: "accepted",
        target_metric_ids: ["MET-0001"],
      }),
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "product/03-features/0001-f.md"),
      matter.stringify("# Feature\n", {
        id: featureIdSchema.parse("FEAT-0099"),
        status: "accepted",
        solution_hypothesis_id: solutionHypothesisIdSchema.parse("SOL-0001"),
        architectural_review_status: "pending",
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("mock architect clears architectural review", async () => {
    await executeCommands(
      fixtureRoot,
      [
        {
          kind: "spawn_architect",
          brief: {
            featureId: featureIdSchema.parse("FEAT-0099"),
            featureTitle: "Feature",
            featureBody: "# Feature\n",
          },
        },
      ],
      false,
      noopLogger,
    );

    const raw = fs.readFileSync(path.join(fixtureRoot, "product/03-features/0001-f.md"), "utf8");
    const { data } = matter(raw);
    expect(data["architectural_review_status"]).toBe("cleared");
  });

  it("mock techlead creates a task file", async () => {
    await executeCommands(
      fixtureRoot,
      [
        {
          kind: "spawn_techlead",
          brief: {
            featureId: featureIdSchema.parse("FEAT-0099"),
            featureTitle: "Feature",
            featureBody: "# Feature\n",
          },
        },
      ],
      false,
      noopLogger,
    );

    const tasksDir = path.join(fixtureRoot, "product/04-tasks");
    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    const raw = fs.readFileSync(path.join(tasksDir, files[0]!), "utf8");
    const { data } = matter(raw);
    expect(data["id"]).toMatch(/^TASK-/);
    expect(data["feature_id"]).toBe("FEAT-0099");
    expect(data["status"]).toBe("todo");
    void taskIdSchema;
  });
});
