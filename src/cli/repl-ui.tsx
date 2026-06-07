import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { scanArtifacts } from "@/store/scan.js";
import { computeActions } from "@/cli/next-cmd.js";
import type { Action } from "@/cli/next-cmd.js";
import {
  resetLastRunUsage,
  getLastRunUsage,
  getSessionUsage,
  getSessionRuns,
} from "@/agents/session-stats.js";
import { dispatchReplCommand, isExpensive } from "@/cli/repl-dispatch.js";
import type { RunUsage } from "@/agents/session-stats.js";
import { fmtUsage } from "@/cli/fmt-usage.js";

type Phase = "loading" | "confirming" | "running" | "idle" | "done";

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function Divider() {
  return <Text dimColor>{"─".repeat(50)}</Text>;
}

interface ReplUIProps {
  docRoot: string;
  onExit: (code: number) => void;
}

export function ReplUI({ docRoot, onExit }: ReplUIProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [actions, setActions] = useState<Action[]>([]);
  const [skipped] = useState(() => new Set<string>());
  const [elapsed, setElapsed] = useState(0);
  const [lastRun, setLastRun] = useState<(RunUsage & { durationSec: number }) | null>(null);

  // Load/reload actions whenever we enter loading phase
  useEffect(() => {
    if (phase !== "loading") return;
    const scan = scanArtifacts(docRoot);
    if (scan.isErr()) {
      onExit(1);
      return;
    }
    const pending = computeActions(scan.value).filter((a) => !skipped.has(a.command));
    setActions(pending);
    setPhase(pending.length === 0 ? "idle" : "confirming");
  }, [phase, docRoot, skipped, onExit]);

  // Live elapsed timer while running
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useInput((input, key) => {
    if (phase === "confirming") {
      const action = actions[0];
      if (!action) return;
      if (input === "y" || key.return) {
        void (async () => {
          setElapsed(0);
          setPhase("running");
          resetLastRunUsage();
          const started = Date.now();
          const code = await dispatchReplCommand(action.command);
          const durationSec = Math.round((Date.now() - started) / 1000);
          const usage = getLastRunUsage();
          setLastRun(usage ? { ...usage, durationSec } : null);
          if (code !== 0) {
            process.stderr.write(`Command exited with code ${code}.\n`);
          }
          skipped.delete(action.command);
          setPhase("loading");
        })();
        return;
      }
      if (input === "s") {
        skipped.add(action.command);
        setPhase("loading");
        return;
      }
    }
    if (phase === "idle") {
      if (input === "q" || (key.ctrl && input === "c")) {
        setPhase("done");
        onExit(0);
      }
      return;
    }
    if (phase === "confirming" || phase === "running") {
      if (input === "q" || (key.ctrl && input === "c")) {
        setPhase("done");
        onExit(0);
      }
    }
  });

  const currentAction = actions[0] ?? null;
  const sessionUsage = getSessionUsage();
  const sessionRuns = getSessionRuns();

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0} width={58}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">
          pet repl
        </Text>
        {phase === "loading" && <Text dimColor> · scanning…</Text>}
        {phase === "idle" && <Text color="green"> · pipeline idle</Text>}
        {(phase === "confirming" || phase === "running") && (
          <Text dimColor>
            {" "}
            · {actions.length} action{actions.length !== 1 ? "s" : ""} remaining
          </Text>
        )}
      </Box>

      <Divider />

      {/* Current action */}
      {currentAction && phase !== "idle" && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{currentAction.command}</Text>
          <Text dimColor># {truncate(currentAction.reason, 50)}</Text>
          {isExpensive(currentAction.command) && (
            <Text color="yellow" dimColor>
              ⚠ LLM call
            </Text>
          )}
        </Box>
      )}

      {/* Running state */}
      {phase === "running" && (
        <Box marginTop={1}>
          <Text color="yellow">● Running… {elapsed}s</Text>
        </Box>
      )}

      {/* Idle state */}
      {phase === "idle" && (
        <Box marginTop={1}>
          <Text color="green">✓ Nothing left to do.</Text>
        </Box>
      )}

      {/* Stats */}
      {(lastRun !== null || sessionRuns > 0) && (
        <Box flexDirection="column" marginTop={1}>
          <Divider />
          {lastRun !== null && (
            <Text dimColor>
              Last run {"  "}
              {lastRun.durationSec}s · {fmtUsage(lastRun)}
            </Text>
          )}
          {sessionRuns > 0 && (
            <Text dimColor>
              Session {"   "}
              {sessionRuns} run{sessionRuns !== 1 ? "s" : ""} · {fmtUsage(sessionUsage)}
            </Text>
          )}
        </Box>
      )}

      {/* Controls */}
      <Box marginTop={1}>
        {phase === "confirming" && (
          <Text dimColor>
            [y/↵] run {"  "}[s] skip {"  "}[q] quit
          </Text>
        )}
        {phase === "idle" && <Text dimColor>[q] quit</Text>}
        {phase === "running" && <Text dimColor>[Ctrl-C] abort</Text>}
      </Box>
    </Box>
  );
}
