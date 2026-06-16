import {
  runAcceptAdr,
  runAcceptMetric,
  runAcceptHypothesis,
  runAcceptSolutionHypothesis,
  runAcceptFeature,
  runAcceptQaPlan,
  runAcceptRelease,
} from "./accept-cmd.js";
import { runDeliver } from "./deliver-cmd.js";
import { runDiscover } from "./discover-cmd.js";
import { runDevelop } from "./develop-cmd.js";
import { runQa } from "./qa-cmd.js";
import { runRelease } from "./release-cmd.js";
import { runNew } from "./new-cmd.js";
import { runTaskDone } from "./task-cmd.js";
import type { ExecuteCallbacks } from "@/agents/executor.js";

export function isExpensive(command: string): boolean {
  const sub = command.replace(/^pet\s+/, "").split(/\s+/)[0];
  return sub === "deliver" || sub === "discover" || sub === "qa" || sub === "release";
}

export async function dispatchReplCommand(
  command: string,
  callbacks?: ExecuteCallbacks,
): Promise<number> {
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
    if (kind === "qa-plan") return runAcceptQaPlan(id, { yes: true });
    if (kind === "release") return runAcceptRelease(id, { yes: true });
  }

  if (sub === "deliver") {
    const featureFlag = args.indexOf("--feature");
    const id = featureFlag >= 0 ? args[featureFlag + 1] : undefined;
    if (!id) return 1;
    return runDeliver({
      feature: id,
      noInk: true,
      ...(callbacks !== undefined ? { callbacks } : {}),
    });
  }

  if (sub === "discover") {
    const hypFlag = args.indexOf("--hypothesis");
    const solFlag = args.indexOf("--solution-hypothesis");
    const featFlag = args.indexOf("--feature");
    if (hypFlag >= 0) {
      const id = args[hypFlag + 1];
      if (!id) return 1;
      return runDiscover({
        hypothesis: id,
        noInk: true,
        ...(callbacks !== undefined ? { callbacks } : {}),
      });
    }
    if (solFlag >= 0) {
      const id = args[solFlag + 1];
      if (!id) return 1;
      return runDiscover({
        solutionHypothesis: id,
        noInk: true,
        ...(callbacks !== undefined ? { callbacks } : {}),
      });
    }
    if (featFlag >= 0) {
      const id = args[featFlag + 1];
      if (!id) return 1;
      return runDiscover({
        feature: id,
        noInk: true,
        ...(callbacks !== undefined ? { callbacks } : {}),
      });
    }
  }

  if (sub === "develop") {
    const taskFlag = args.indexOf("--task");
    const id = taskFlag >= 0 ? args[taskFlag + 1] : undefined;
    if (!id) return 1;
    return runDevelop({
      task: id,
      noInk: true,
      ...(callbacks !== undefined ? { callbacks } : {}),
    });
  }

  if (sub === "qa") {
    const featureFlag = args.indexOf("--feature");
    const id = featureFlag >= 0 ? args[featureFlag + 1] : undefined;
    if (!id) return 1;
    return runQa({
      feature: id,
      noInk: true,
      ...(callbacks !== undefined ? { callbacks } : {}),
    });
  }

  if (sub === "release") {
    const releaseFlag = args.indexOf("--release");
    const id = releaseFlag >= 0 ? args[releaseFlag + 1] : undefined;
    if (!id) return 1;
    return runRelease({
      release: id,
      noInk: true,
      ...(callbacks !== undefined ? { callbacks } : {}),
    });
  }

  if (sub === "task") {
    const [taskSub, id] = args;
    if (taskSub === "done") {
      if (!id) return 1;
      return runTaskDone(id);
    }
  }

  if (sub === "new") {
    const [subKind, ...newArgs] = args;
    if (subKind === "release") {
      const featuresFlag = newArgs.indexOf("--features");
      if (featuresFlag < 0 || !newArgs[featuresFlag + 1]) return 1;
      const features = newArgs[featuresFlag + 1]!;
      const titleParts = newArgs.filter((a, i) => !a.startsWith("--") && i !== featuresFlag + 1);
      const title = titleParts.length > 0 ? titleParts.join(" ") : features;
      return runNew("release", title, { features });
    }
  }

  console.error(`repl: unknown command: ${command}`);
  return 1;
}
