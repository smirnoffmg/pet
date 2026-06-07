import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { getLastRunUsage, resetLastRunUsage } from "@/agents/session-stats.js";
import { fmtUsage } from "@/cli/fmt-usage.js";
import type { ToolCallEvent } from "@/agents/run-agent.js";
import type { RunUsage } from "@/agents/session-stats.js";

const MAX_TOOL_CALLS = 8;
const DONE_LINGER_MS = 1500;

type Phase = "running" | "done" | "error";

interface ToolCallEntry {
  name: string;
  path: string;
  active: boolean;
}

interface AgentPanelCallbacks {
  onAgentStart: (role: string) => void;
  onToolCall: (e: ToolCallEvent) => void;
}

interface AgentPanelProps {
  heading: string;
  runFn: (callbacks: AgentPanelCallbacks) => Promise<number>;
  onExit: (code: number) => void;
}

function Divider() {
  return <Text dimColor>{"─".repeat(50)}</Text>;
}

function truncatePath(s: string): string {
  return s.length <= 38 ? s : `${s.slice(0, 37)}…`;
}

export function AgentPanel({ heading, runFn, onExit }: AgentPanelProps) {
  const [phase, setPhase] = useState<Phase>("running");
  const [currentRole, setCurrentRole] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [lastRun, setLastRun] = useState<(RunUsage & { durationSec: number }) | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const exitCodeRef = useRef(0);

  useEffect(() => {
    const started = Date.now();
    resetLastRunUsage();

    const callbacks: AgentPanelCallbacks = {
      onAgentStart: (role) => setCurrentRole(role),
      onToolCall: (e) => {
        setToolCalls((prev) => {
          const updated = prev.map((c) => (c.active ? { ...c, active: false } : c));
          const next = [...updated, { name: e.name, path: e.path, active: true }];
          return next.slice(-MAX_TOOL_CALLS);
        });
      },
    };

    runFn(callbacks)
      .then((code) => {
        exitCodeRef.current = code;
        const durationSec = Math.round((Date.now() - started) / 1000);
        const usage = getLastRunUsage();
        setLastRun(usage ? { ...usage, durationSec } : null);
        setToolCalls((prev) => prev.map((c) => ({ ...c, active: false })));
        setPhase("done");
        setTimeout(() => onExit(code), DONE_LINGER_MS);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        setPhase("error");
        setTimeout(() => onExit(1), DONE_LINGER_MS);
      });
  }, []); // mount-only: runFn and onExit are stable refs

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const { isRawModeSupported } = useStdin();
  useInput(
    (_input, key) => {
      if (key.ctrl && _input === "c") {
        process.kill(process.pid, "SIGINT");
      }
    },
    { isActive: isRawModeSupported },
  );

  const statusLine =
    phase === "running" ? (
      <Text>
        {currentRole && (
          <Text dimColor>
            {currentRole}
            {" · "}
          </Text>
        )}
        <Text color="yellow">● Running… {elapsed}s</Text>
      </Text>
    ) : phase === "done" ? (
      <Text>
        {currentRole && (
          <Text dimColor>
            {currentRole}
            {" · "}
          </Text>
        )}
        <Text color="green">✓ Done in {lastRun?.durationSec ?? elapsed}s</Text>
      </Text>
    ) : (
      <Text color="red">✗ Error</Text>
    );

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0} width={58}>
      <Box>
        <Text bold color="cyan">
          {heading}
        </Text>
      </Box>

      <Box marginTop={1}>{statusLine}</Box>

      {toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Divider />
          {phase === "done" ? (
            <Text dimColor>── Tool calls ({toolCalls.length})</Text>
          ) : (
            <Text dimColor>── Tool calls</Text>
          )}
          {toolCalls.map((tc, i) => (
            <Box key={i}>
              <Text dimColor>{tc.name.padEnd(12)}</Text>
              <Text dimColor>{truncatePath(tc.path)}</Text>
              {tc.active && (
                <Text color="yellow" dimColor>
                  {"  ●"}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {phase === "error" && errorMsg && (
        <Box marginTop={1}>
          <Text color="red">{errorMsg}</Text>
        </Box>
      )}

      {phase === "done" && lastRun && (
        <Box marginTop={1}>
          <Text dimColor>{fmtUsage(lastRun)}</Text>
        </Box>
      )}

      {phase === "running" && (
        <Box marginTop={1}>
          <Text dimColor>[Ctrl-C] abort</Text>
        </Box>
      )}
    </Box>
  );
}
