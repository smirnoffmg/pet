import { confirm } from "@inquirer/prompts";
import { scanArtifacts } from "@/store/scan.js";
import { docRoot, findRepoRoot } from "@/store/repo-root.js";

function startTimer(): () => void {
  const start = Date.now();
  const interval = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    process.stderr.write(`\r  ⏱  ${s}s`);
  }, 1000);
  return () => {
    clearInterval(interval);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    process.stderr.write(`\r  ⏱  done in ${elapsed}s\n`);
  };
}
import { computeActions } from "./next-cmd.js";
import {
  runAcceptAdr,
  runAcceptMetric,
  runAcceptHypothesis,
  runAcceptSolutionHypothesis,
  runAcceptFeature,
} from "./accept-cmd.js";
import { runDeliver } from "./deliver-cmd.js";
import { runDiscover } from "./discover-cmd.js";

async function dispatch(command: string): Promise<number> {
  const parts = command.replace(/^pet\s+/, "").split(/\s+/);
  const [sub, ...args] = parts;

  if (sub === "accept") {
    const [kind, id] = args;
    if (!id) return 1;
    if (kind === "adr") return runAcceptAdr(id, { yes: true });
    if (kind === "metric") return runAcceptMetric(id, { yes: true });
    if (kind === "hypothesis") return runAcceptHypothesis(id, { yes: true });
    if (kind === "solution-hypothesis") return runAcceptSolutionHypothesis(id, { yes: true });
    if (kind === "feature") return runAcceptFeature(id, { yes: true });
  }

  if (sub === "deliver") {
    const featureFlag = args.indexOf("--feature");
    const id = featureFlag >= 0 ? args[featureFlag + 1] : undefined;
    if (!id) return 1;
    return runDeliver({ feature: id });
  }

  if (sub === "discover") {
    const hypFlag = args.indexOf("--hypothesis");
    const solFlag = args.indexOf("--solution-hypothesis");
    if (hypFlag >= 0) {
      const id = args[hypFlag + 1];
      if (!id) return 1;
      return runDiscover({ hypothesis: id });
    }
    if (solFlag >= 0) {
      const id = args[solFlag + 1];
      if (!id) return 1;
      return runDiscover({ solutionHypothesis: id });
    }
  }

  console.error(`repl: unknown command: ${command}`);
  return 1;
}

function isExpensive(command: string): boolean {
  return command.includes("deliver") || command.includes("discover");
}

export async function runRepl(): Promise<number> {
  const repoRoot = findRepoRoot();
  const root = docRoot(repoRoot);

  console.log("PET pipeline REPL — press q or Ctrl-C to quit\n");

  const skipped = new Set<string>();

  for (;;) {
    const scan = scanArtifacts(root);
    if (scan.isErr()) {
      console.error(scan.error.message);
      return 1;
    }

    const actions = computeActions(scan.value).filter((a) => !skipped.has(a.command));

    if (actions.length === 0) {
      console.log("Pipeline is idle — nothing left to do.");
      return 0;
    }

    const [action] = actions;
    if (!action) return 0;

    console.log(`\nNext:  ${action.command}`);
    console.log(`       # ${action.reason}`);

    if (isExpensive(action.command)) {
      let choice: "run" | "skip" | "quit";
      try {
        const run = await confirm({ message: "Run? (n to skip, Ctrl-C to quit)", default: true });
        choice = run ? "run" : "skip";
      } catch {
        choice = "quit";
      }
      if (choice === "quit") break;
      if (choice === "skip") {
        skipped.add(action.command);
        continue;
      }
    } else {
      // accept commands: just confirm once, default yes
      let ok: boolean;
      try {
        ok = await confirm({ message: "Accept?", default: true });
      } catch {
        break;
      }
      if (!ok) {
        skipped.add(action.command);
        continue;
      }
    }

    console.log("");
    const stop = startTimer();
    const code = await dispatch(action.command);
    stop();
    if (code !== 0) {
      console.error(`Command exited with code ${code}. Continuing...`);
    }
  }

  console.log("\nExiting REPL.");
  return 0;
}
