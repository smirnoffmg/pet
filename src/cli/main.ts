#!/usr/bin/env node
import { Command } from "commander";
import { runValidate } from "./validate-cmd.js";
import { runNew, runNewAdr } from "./new-cmd.js";
import { runDeliver } from "./deliver-cmd.js";
import { runDiscover } from "./discover-cmd.js";
import { runOrchestrate } from "./orchestrate-cmd.js";
import { runDevelop } from "./develop-cmd.js";
import { runQa } from "./qa-cmd.js";
import { runRelease } from "./release-cmd.js";
import {
  runAcceptHypothesis,
  runAcceptSolutionHypothesis,
  runAcceptFeature,
  runAcceptAdr,
  runAcceptMetric,
  runAcceptQaPlan,
  runAcceptRelease,
} from "./accept-cmd.js";
import { runClean } from "./clean-cmd.js";
import { runLogs } from "./logs-cmd.js";
import { runList } from "./list-cmd.js";
import { runNext } from "./next-cmd.js";
import { runRepl } from "./repl-cmd.js";
import { runChatSession } from "@/chat/session.js";
import { runInit } from "./init-cmd.js";
import { findRepoRoot } from "@/store/repo-root.js";
import type { ArtifactKind } from "@/schemas/ids.js";

const program = new Command();

program.name("pet").description("Product Development Toolkit").version("0.0.0");

program
  .command("validate")
  .description("Validate all artifacts under doc/")
  .option("-d, --doc <path>", "Path to doc/ directory")
  .action((options: { doc?: string }) => {
    process.exit(runValidate(options));
  });

const newCmd = program.command("new").description("Create a new artifact");

function addNewSubcommand(kind: ArtifactKind, description: string): void {
  const cmd = newCmd
    .command(kind.replace("_", "-"))
    .description(description)
    .argument("[title]", "Artifact title")
    .option("--metric <id>", "Target metric ID (hypothesis)")
    .option("--hypothesis <id>", "Problem hypothesis ID (solution-hypothesis, feature)")
    .option("--solution-hypothesis <id>", "Solution hypothesis ID (feature)")
    .option("--feature <id>", "Feature ID (task)")
    .option("--features <ids>", "Comma-separated feature IDs (release)")
    .action(
      async (
        title: string | undefined,
        options: {
          metric?: string;
          hypothesis?: string;
          solutionHypothesis?: string;
          feature?: string;
          features?: string;
        },
      ) => {
        const code = await runNew(kind, title, options);
        process.exit(code);
      },
    );
  void cmd;
}

addNewSubcommand("metric", "Create a target metric");
addNewSubcommand("hypothesis", "Create a problem hypothesis");
addNewSubcommand("solution_hypothesis", "Create a solution hypothesis");
addNewSubcommand("feature", "Create a feature");
addNewSubcommand("release", "Create a release plan");
addNewSubcommand("task", "Create a dev task");
newCmd
  .command("adr")
  .description("Create an ADR (Michael Nygard format, compatible with adr-tools)")
  .argument("[title]", "ADR title")
  .action(async (title: string | undefined) => {
    const code = await runNewAdr(title);
    process.exit(code);
  });
addNewSubcommand("qa_plan", "Create a QA plan (requires --feature <id>)");

program
  .command("deliver")
  .description("Run DeliveryLead on a feature (Architect → TechLead)")
  .requiredOption("--feature <id>", "Feature ID (e.g. FEAT-0001)")
  .option("--dry-run", "Print planned subagent spawns without executing")
  .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
  .option("-v, --verbose", "Log agent progress to stderr (also PET_VERBOSE=1)")
  .action(
    async (options: { feature: string; dryRun?: boolean; yes?: boolean; verbose?: boolean }) => {
      const code = await runDeliver({
        feature: options.feature,
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
      });
      process.exit(code);
    },
  );

function registerDiscoverCommand(name: string): void {
  program
    .command(name)
    .description(
      "Run DiscoveryLead on a hypothesis, solution hypothesis, or feature (enrich scaffold body)",
    )
    .option("--hypothesis <id>", "Problem hypothesis ID (e.g. PROB-0001)")
    .option("--solution-hypothesis <id>", "Solution hypothesis ID (e.g. SOL-0001)")
    .option("--feature <id>", "Enrich a scaffold feature body (e.g. FEAT-0003)")
    .option("--dry-run", "Print planned subagent spawns without executing")
    .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
    .option("-v, --verbose", "Log all lines to stderr (also PET_VERBOSE=1)")
    .action(
      async (options: {
        hypothesis?: string;
        solutionHypothesis?: string;
        feature?: string;
        dryRun?: boolean;
        yes?: boolean;
        verbose?: boolean;
      }) => {
        const code = await runDiscover({
          ...(options.hypothesis !== undefined ? { hypothesis: options.hypothesis } : {}),
          ...(options.solutionHypothesis !== undefined
            ? { solutionHypothesis: options.solutionHypothesis }
            : {}),
          ...(options.feature !== undefined ? { feature: options.feature } : {}),
          ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
          ...(options.yes !== undefined ? { yes: options.yes } : {}),
          ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
        });
        process.exit(code);
      },
    );
}

registerDiscoverCommand("discover");
registerDiscoverCommand("discovery");

program
  .command("develop")
  .description("Run Dev agent on a task (enrich task body with implementation approach)")
  .requiredOption("--task <id>", "Task ID (e.g. TASK-0001)")
  .option("--dry-run", "Print planned subagent spawns without executing")
  .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
  .option("-v, --verbose", "Log agent progress to stderr (also PET_VERBOSE=1)")
  .action(async (options: { task: string; dryRun?: boolean; yes?: boolean; verbose?: boolean }) => {
    const code = await runDevelop({
      task: options.task,
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      ...(options.yes !== undefined ? { yes: options.yes } : {}),
      ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
    });
    process.exit(code);
  });

program
  .command("qa")
  .description("Run QA agent on a feature (create QA plan artifact)")
  .requiredOption("--feature <id>", "Feature ID (e.g. FEAT-0001)")
  .option("--dry-run", "Print planned subagent spawns without executing")
  .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
  .option("-v, --verbose", "Log agent progress to stderr (also PET_VERBOSE=1)")
  .action(
    async (options: { feature: string; dryRun?: boolean; yes?: boolean; verbose?: boolean }) => {
      const code = await runQa({
        feature: options.feature,
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
      });
      process.exit(code);
    },
  );

program
  .command("release")
  .description("Run DevOps agent on a release (enrich release body with deployment checklist)")
  .requiredOption("--release <id>", "Release ID (e.g. REL-0001)")
  .option("--dry-run", "Print planned subagent spawns without executing")
  .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
  .option("-v, --verbose", "Log agent progress to stderr (also PET_VERBOSE=1)")
  .action(
    async (options: { release: string; dryRun?: boolean; yes?: boolean; verbose?: boolean }) => {
      const code = await runRelease({
        release: options.release,
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
      });
      process.exit(code);
    },
  );

program
  .command("orchestrate")
  .description("Advance the pipeline by one step (delivery takes priority over discovery)")
  .option("--dry-run", "Print the next planned step without executing")
  .option("--yes", "Skip cost confirmation (does not skip HITL gates)")
  .option("-v, --verbose", "Log agent progress to stderr (also PET_VERBOSE=1)")
  .action(async (options: { dryRun?: boolean; yes?: boolean; verbose?: boolean }) => {
    const code = await runOrchestrate({
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      ...(options.yes !== undefined ? { yes: options.yes } : {}),
      ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
    });
    process.exit(code);
  });

const acceptCmd = program.command("accept").description("HITL promotion of decision artifacts");

acceptCmd
  .command("hypothesis")
  .description("Promote a problem hypothesis from proposed to accepted")
  .argument("<id>", "Hypothesis ID (e.g. PROB-0001)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(
      await runAcceptHypothesis(id, options.yes !== undefined ? { yes: options.yes } : {}),
    );
  });

acceptCmd
  .command("solution-hypothesis")
  .description("Promote a solution hypothesis from proposed to accepted")
  .argument("<id>", "Solution hypothesis ID (e.g. SOL-0001)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(
      await runAcceptSolutionHypothesis(id, options.yes !== undefined ? { yes: options.yes } : {}),
    );
  });

acceptCmd
  .command("feature")
  .description("Promote a feature from proposed to accepted")
  .argument("<id>", "Feature ID (e.g. FEAT-0001)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(await runAcceptFeature(id, options.yes !== undefined ? { yes: options.yes } : {}));
  });

acceptCmd
  .command("adr")
  .description("Promote an ADR from proposed to accepted")
  .argument("<id>", "ADR number (e.g. 13 or 0013)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(await runAcceptAdr(id, options.yes !== undefined ? { yes: options.yes } : {}));
  });

acceptCmd
  .command("metric")
  .description("Promote a metric from proposed to accepted")
  .argument("<id>", "Metric ID (e.g. MET-0002)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(await runAcceptMetric(id, options.yes !== undefined ? { yes: options.yes } : {}));
  });

acceptCmd
  .command("qa-plan")
  .description("Promote a QA plan from proposed to accepted")
  .argument("<id>", "QA plan ID (e.g. QA-0001)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(await runAcceptQaPlan(id, options.yes !== undefined ? { yes: options.yes } : {}));
  });

acceptCmd
  .command("release")
  .description("Promote a release from proposed to accepted")
  .argument("<id>", "Release ID (e.g. REL-0001)")
  .option("--yes", "Skip HITL confirmation prompt (for scripted/test use only)")
  .action(async (id: string, options: { yes?: boolean }) => {
    process.exit(await runAcceptRelease(id, options.yes !== undefined ? { yes: options.yes } : {}));
  });

program
  .command("repl")
  .description("Interactive pipeline loop: show next action, confirm, run, repeat")
  .action(async () => {
    process.exit(await runRepl());
  });

program
  .command("next")
  .description("Show the next recommended action in the pipeline")
  .action(() => {
    process.exit(runNext());
  });

program
  .command("list")
  .description(
    "List artifacts. No args: pipeline tree (HYP → SOL → FEAT). Optional kind: metrics, hypotheses, solutions, features, tasks, adrs, releases",
  )
  .argument("[kind]", "Artifact kind to filter by")
  .action((kind: string | undefined) => {
    process.exit(runList(kind));
  });

program
  .command("clean")
  .description("Remove local session data under ~/.local/share/pet/")
  .action(() => {
    process.exit(runClean());
  });

program
  .command("logs")
  .description("Show orchestration audit log and latest session run log")
  .option("--session <id>", "Session directory name (default: most recent)")
  .option("--tail <n>", "Lines of session log to show", "50")
  .action((options: { session?: string; tail: string }) => {
    const tail = Number.parseInt(options.tail, 10);
    process.exit(
      runLogs({
        ...(options.session !== undefined ? { session: options.session } : {}),
        tail: Number.isNaN(tail) ? 50 : tail,
      }),
    );
  });

program
  .command("init")
  .description(
    "Analyse the current repository and write a project context summary to doc/product/context/project.md",
  )
  .action(async () => {
    process.exit(await runInit());
  });

program
  .command("chat", { isDefault: true })
  .description("Start an interactive session to create artifacts and run controllers")
  .action(async () => {
    await runChatSession({ repoRoot: findRepoRoot() });
  });

program.parse();
