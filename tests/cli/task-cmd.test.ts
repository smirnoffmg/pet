import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import matter from "gray-matter";
import { runTaskDone } from "@/cli/task-cmd.js";

interface Fixture {
  root: string;
  doc: string;
}

function writeArtifact(fixture: Fixture, relPath: string, content: string): string {
  const full = path.join(fixture.doc, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  // Append a per-fixture nonce so gray-matter's content-keyed parse cache does
  // not collide across tests that write byte-identical frontmatter (the
  // production code mutates the cached data object in place when marking a
  // task done, which would otherwise leak into the next test's parse result).
  const nonce = `<!-- nonce: ${randomBytes(8).toString("hex")} -->\n`;
  fs.writeFileSync(full, content + nonce, "utf8");
  return full;
}

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-task-done-"));
  const doc = path.join(root, "doc");
  fs.mkdirSync(doc, { recursive: true });
  return { root, doc };
}

function gitExec(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: "ignore" });
}

function frontmatterOf(filePath: string): Record<string, unknown> {
  return matter(fs.readFileSync(filePath, "utf8")).data;
}

function seedPipeline(fixture: Fixture): void {
  writeArtifact(
    fixture,
    "product/00-problem-hypotheses/0001-h.md",
    "---\nid: PROB-0001\nstatus: accepted\n---\n# H\n",
  );
  writeArtifact(
    fixture,
    "product/01-metrics/0001-m.md",
    "---\nid: MET-0001\nstatus: accepted\nproblem_hypothesis_id: PROB-0001\n---\n# M\n",
  );
  writeArtifact(
    fixture,
    "product/02-solution-hypotheses/0001-s.md",
    "---\nid: SOL-0001\nstatus: accepted\nmetric_ids: [MET-0001]\n---\n# S\n",
  );
  writeArtifact(
    fixture,
    "product/03-features/0001-f.md",
    "---\nid: FEAT-0001\nstatus: accepted\nsolution_hypothesis_id: SOL-0001\n---\n# F\n\nReal acceptance criteria.\n",
  );
}

describe("runTaskDone", () => {
  let originalCwd: string;
  let fixture: Fixture;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixture = createFixture();
    seedPipeline(fixture);
    process.chdir(fixture.root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it.each(["todo", "in_progress", "review"])(
    "marks a %s task as done, stamps completed_at, and archives the file",
    async (status) => {
      const source = writeArtifact(
        fixture,
        "product/04-tasks/0001-t.md",
        `---\nid: TASK-0001\nstatus: ${status}\nfeature_id: FEAT-0001\n---\n# T\n`,
      );
      const archived = path.join(fixture.doc, "product/04-tasks/archive/0001-t.md");

      const code = await runTaskDone("TASK-0001");

      expect(code).toBe(0);
      expect(fs.existsSync(source)).toBe(false);
      expect(fs.existsSync(archived)).toBe(true);

      const fm = frontmatterOf(archived);
      expect(fm["status"]).toBe("done");
      expect(typeof fm["completed_at"]).toBe("string");
      expect(() => new Date(fm["completed_at"] as string).toISOString()).not.toThrow();
    },
  );

  it("captures the current commit_sha when run inside a git repo", async () => {
    gitExec("git init", fixture.root);
    gitExec("git config user.email test@test.com", fixture.root);
    gitExec("git config user.name Test", fixture.root);
    gitExec("git add . && git commit -m init", fixture.root);
    const expectedSha = execSync("git rev-parse HEAD", {
      cwd: fixture.root,
      encoding: "utf8",
    }).trim();

    writeArtifact(
      fixture,
      "product/04-tasks/0001-t.md",
      "---\nid: TASK-0001\nstatus: todo\nfeature_id: FEAT-0001\n---\n# T\n",
    );

    const code = await runTaskDone("TASK-0001");

    expect(code).toBe(0);
    const archived = path.join(fixture.doc, "product/04-tasks/archive/0001-t.md");
    expect(frontmatterOf(archived)["commit_sha"]).toBe(expectedSha);
  });

  it("is a no-op (exit 0) and does not move the file when the task is already done", async () => {
    const file = writeArtifact(
      fixture,
      "product/04-tasks/0001-t.md",
      "---\nid: TASK-0001\nstatus: done\nfeature_id: FEAT-0001\n---\n# T\n",
    );

    const code = await runTaskDone("TASK-0001");

    expect(code).toBe(0);
    expect(fs.existsSync(file)).toBe(true);
    expect(frontmatterOf(file)["completed_at"]).toBeUndefined();
  });

  it("returns 1 when the task does not exist", async () => {
    const code = await runTaskDone("TASK-0099");
    expect(code).toBe(1);
  });

  it("rolls back the frontmatter and the file move when validation fails", async () => {
    const source = writeArtifact(
      fixture,
      "product/04-tasks/0001-t.md",
      // feature_id points at a feature that doesn't exist — FK validation will fail
      "---\nid: TASK-0001\nstatus: todo\nfeature_id: FEAT-0099\n---\n# T\n",
    );

    const code = await runTaskDone("TASK-0001");

    expect(code).toBe(1);
    expect(fs.existsSync(source)).toBe(true);
    expect(frontmatterOf(source)["status"]).toBe("todo");
  });
});
