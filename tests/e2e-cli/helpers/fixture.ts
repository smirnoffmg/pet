import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CliFixture {
  /** Repo root — pass as `cwd` to runPet. `findRepoRoot()` resolves to this. */
  root: string;
  /** `<root>/doc` */
  doc: string;
  /** `<root>/doc/product` */
  product: string;
  cleanup(): void;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

/**
 * A throwaway git repo standing in for a user's project.
 *
 * The `git init` is not optional: `findRepoRoot()` shells out to
 * `git rev-parse --show-toplevel`, so without it every `pet` invocation would
 * resolve to the pet repository itself and write artifacts into it.
 */
export function createCliFixture(name = "pet-e2e"): CliFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

  fs.writeFileSync(
    path.join(root, "README.md"),
    "# checkout-service\n\nCheckout flow for the storefront.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "checkout-service", version: "1.0.0" }, null, 2)}\n`,
    "utf8",
  );

  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "e2e@example.com"]);
  git(root, ["config", "user.name", "E2E"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);

  return {
    root,
    doc: path.join(root, "doc"),
    product: path.join(root, "doc", "product"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Fills every empty ## section the way a human editing a proposed artifact
 * would — the accept gate refuses scaffold bodies, --yes included.
 */
export function fillEmptySections(filePath: string): void {
  const raw = fs.readFileSync(filePath, "utf8");
  const filled = raw.replace(
    /^(## .+)\n(?=\s*(?:## |$))/gm,
    "$1\n\nFilled by the human before the gate.\n",
  );
  fs.writeFileSync(filePath, filled, "utf8");
}

/** Commits everything, so immutability checks have a HEAD to compare against. */
export function commitAll(fixture: CliFixture, message: string): void {
  git(fixture.root, ["add", "-A"]);
  git(fixture.root, ["commit", "-qm", message]);
}

/** Relative paths of every artifact file, sorted — the shape of the pipeline on disk. */
export function artifactTree(fixture: CliFixture): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(fixture.doc, full));
    }
  };
  walk(fixture.doc);
  return out;
}

/** First artifact id of a kind, read from the numbered directory. */
export function idsIn(fixture: CliFixture, dir: string): string[] {
  const full = path.join(fixture.product, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(full, f), "utf8");
      return /^id:\s*(\S+)/m.exec(raw)?.[1] ?? f;
    });
}
