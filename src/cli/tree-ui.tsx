import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdin, useStdout } from "ink";
import { scanArtifacts } from "@/store/scan.js";
import { computeArtifactActions } from "@/cli/next-cmd.js";
import type { Action } from "@/cli/next-cmd.js";
import { dispatchReplCommand } from "@/cli/repl-dispatch.js";
import type { ParsedArtifact } from "@/store/parse.js";
import type { SolutionHypothesisFrontmatter } from "@/schemas/solution-hypothesis.js";
import type { FeatureFrontmatter } from "@/schemas/feature.js";
import type { DevTaskFrontmatter } from "@/schemas/task.js";
import type { ExecuteCallbacks } from "@/agents/executor.js";
import type { ToolCallEvent } from "@/agents/run-agent.js";

// ─── Row model ───────────────────────────────────────────────────────────────

type ArtifactRow = {
  type: "artifact";
  artifact: ParsedArtifact;
  depth: 0 | 1 | 2 | 3;
  hasChildren: boolean;
  isCollapsed: boolean;
};
type ActionRow = { type: "action"; action: Action; actionIndex: number };
type Row = ArtifactRow | ActionRow;

// ─── State ───────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";

interface AgentState {
  command: string;
  elapsed: number;
  recentCalls: string[];
  runningArtifactId: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type WithStatus = { id: string; status: string };

function fm(artifact: ParsedArtifact): WithStatus {
  return artifact.frontmatter as unknown as WithStatus;
}

function artifactTitle(artifact: ParsedArtifact): string {
  const match = /^#[ \t]+(.+)$/m.exec(artifact.body);
  return match?.[1]?.trim() ?? fm(artifact).id;
}

function byId(a: ParsedArtifact, b: ParsedArtifact): number {
  return a.frontmatter.id.localeCompare(b.frontmatter.id);
}

function active(artifact: ParsedArtifact): boolean {
  return fm(artifact).status !== "superseded";
}

function extractArtifactId(command: string): string | null {
  const match = /\b([A-Z]+-\d+)\b/.exec(command);
  return match?.[1] ?? null;
}

function buildRows(
  artifacts: ParsedArtifact[],
  expanded: string | null,
  expandedActions: Action[],
  collapsed: Set<string>,
): Row[] {
  const rows: Row[] = [];

  const hyps = artifacts.filter((a) => a.kind === "hypothesis" && active(a)).sort(byId);
  const sols = artifacts.filter((a) => a.kind === "solution_hypothesis");
  const feats = artifacts.filter((a) => a.kind === "feature");
  const tasks = artifacts.filter((a) => a.kind === "task");

  // Pre-compute which IDs have children
  const solsByHyp = new Map<string, ParsedArtifact[]>();
  for (const sol of sols.filter(active)) {
    const pid = (sol.frontmatter as SolutionHypothesisFrontmatter).problem_hypothesis_id as string;
    solsByHyp.set(pid, [...(solsByHyp.get(pid) ?? []), sol]);
  }
  const featsBySol = new Map<string, ParsedArtifact[]>();
  for (const feat of feats.filter(active)) {
    const sid = (feat.frontmatter as FeatureFrontmatter).solution_hypothesis_id as string;
    featsBySol.set(sid, [...(featsBySol.get(sid) ?? []), feat]);
  }
  const tasksByFeat = new Map<string, ParsedArtifact[]>();
  for (const task of tasks) {
    const fid = (task.frontmatter as DevTaskFrontmatter).feature_id as string;
    tasksByFeat.set(fid, [...(tasksByFeat.get(fid) ?? []), task]);
  }

  function maybeInjectActions(id: string): void {
    if (expanded !== id) return;
    if (expandedActions.length === 0) {
      rows.push({
        type: "action",
        action: { command: "(no actions available)", reason: "" },
        actionIndex: -1,
      });
    } else {
      expandedActions.forEach((action, actionIndex) => {
        rows.push({ type: "action", action, actionIndex });
      });
    }
  }

  for (const hyp of hyps) {
    const hypId = fm(hyp).id;
    const hypChildren = solsByHyp.get(hypId) ?? [];
    const hypCollapsed = collapsed.has(hypId);
    rows.push({
      type: "artifact",
      artifact: hyp,
      depth: 0,
      hasChildren: hypChildren.length > 0,
      isCollapsed: hypCollapsed,
    });
    maybeInjectActions(hypId);
    if (hypCollapsed) continue;

    for (const sol of hypChildren.sort(byId)) {
      const solId = fm(sol).id;
      const solChildren = featsBySol.get(solId) ?? [];
      const solCollapsed = collapsed.has(solId);
      rows.push({
        type: "artifact",
        artifact: sol,
        depth: 1,
        hasChildren: solChildren.length > 0,
        isCollapsed: solCollapsed,
      });
      maybeInjectActions(solId);
      if (solCollapsed) continue;

      for (const feat of solChildren.sort(byId)) {
        const featId = fm(feat).id;
        const featChildren = tasksByFeat.get(featId) ?? [];
        const featCollapsed = collapsed.has(featId);
        rows.push({
          type: "artifact",
          artifact: feat,
          depth: 2,
          hasChildren: featChildren.length > 0,
          isCollapsed: featCollapsed,
        });
        maybeInjectActions(featId);
        if (featCollapsed) continue;

        for (const task of featChildren.sort(byId)) {
          const taskId = fm(task).id;
          rows.push({
            type: "artifact",
            artifact: task,
            depth: 3,
            hasChildren: false,
            isCollapsed: false,
          });
          maybeInjectActions(taskId);
        }
      }
    }
  }

  const metrics = artifacts.filter((a) => a.kind === "metric" && active(a)).sort(byId);
  const releases = artifacts.filter((a) => a.kind === "release" && active(a)).sort(byId);

  for (const m of metrics) {
    rows.push({ type: "artifact", artifact: m, depth: 0, hasChildren: false, isCollapsed: false });
    maybeInjectActions(fm(m).id);
  }
  for (const r of releases) {
    rows.push({ type: "artifact", artifact: r, depth: 0, hasChildren: false, isCollapsed: false });
    maybeInjectActions(fm(r).id);
  }

  return rows;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function statusColor(status: string): "green" | "yellow" | "gray" | "blue" | "cyan" {
  if (status === "accepted" || status === "done") return "green";
  if (status === "superseded") return "gray";
  if (status === "in_progress") return "blue";
  if (status === "review") return "cyan";
  return "yellow";
}

interface TreeRowViewProps {
  row: ArtifactRow;
  focused: boolean;
  expanded: boolean;
  agentRunning: boolean;
}

function TreeRowView({ row, focused, expanded, agentRunning }: TreeRowViewProps) {
  const { artifact, depth, hasChildren, isCollapsed } = row;
  const { id, status } = fm(artifact);
  const indent = "  ".repeat(depth);
  const treeGlyph = hasChildren ? (isCollapsed ? "▶" : "▼") : " ";

  return (
    <Box>
      <Text dimColor={!focused}>{indent}</Text>
      {focused ? (
        <Text bold color="white">
          {"→"}
        </Text>
      ) : (
        <Text> </Text>
      )}
      {hasChildren ? (
        <Text color={isCollapsed ? "yellow" : "cyan"}>{` ${treeGlyph} `}</Text>
      ) : (
        <Text dimColor>{` ${treeGlyph} `}</Text>
      )}
      <Text color="cyan">{id.padEnd(9)}</Text>
      <Text color={statusColor(status)}>{` ${status.padEnd(10)} `}</Text>
      {focused ? (
        <Text color="white">{artifactTitle(artifact)}</Text>
      ) : (
        <Text dimColor>{artifactTitle(artifact)}</Text>
      )}
      {expanded && <Text dimColor>{" ▾"}</Text>}
      {agentRunning && <Text color="yellow">{" ● running"}</Text>}
    </Box>
  );
}

interface ActionRowViewProps {
  row: ActionRow;
  focused: boolean;
}

function ActionRowView({ row, focused }: ActionRowViewProps) {
  const noOp = row.actionIndex === -1;
  return (
    <Box paddingLeft={4}>
      {noOp ? (
        <Text dimColor>
          {"  "}
          {row.action.command}
        </Text>
      ) : focused ? (
        <Text bold color="cyan">
          {"↵ "}
          {row.action.command}
        </Text>
      ) : (
        <Text>
          {"  "}
          {row.action.command}
        </Text>
      )}
      {row.action.reason.length > 0 && <Text dimColor>{`  # ${row.action.reason}`}</Text>}
    </Box>
  );
}

interface DockedStripProps {
  state: AgentState;
}

function DockedStrip({ state }: DockedStripProps) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderColor="yellow"
      paddingX={1}
    >
      <Text color="yellow">{`● Running  ${state.command}  · ${state.elapsed}s`}</Text>
      {state.recentCalls.map((call, i) =>
        i === state.recentCalls.length - 1 ? (
          <Text key={i} color="blue">
            {"  "}
            {call}
          </Text>
        ) : (
          <Text key={i} dimColor>
            {"  "}
            {call}
          </Text>
        ),
      )}
    </Box>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

interface TreeUIProps {
  docRoot: string;
  onExit: (code: number) => void;
}

const HEADER_LINES = 2;
const CONTROLS_LINES = 2;
const DOCKED_MAX_LINES = 8; // marginTop + border + "Running" + 4 calls + border

export function TreeUI({ docRoot, onExit }: TreeUIProps) {
  const [artifacts, setArtifacts] = useState<ParsedArtifact[]>([]);
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedActions, setExpandedActions] = useState<Action[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const { stdout } = useStdout();

  function doScan(): ParsedArtifact[] | null {
    const result = scanArtifacts(docRoot);
    if (result.isErr()) {
      setScanError(result.error.message);
      return null;
    }
    setScanError(null);
    return result.value;
  }

  function refresh(): void {
    const scanned = doScan();
    if (!scanned) return;
    setArtifacts(scanned);
    setExpanded(null);
    setExpandedActions([]);
    setCursor(0);
  }

  useEffect(() => {
    refresh();
  }, []); // mount only

  const rows = useMemo(
    () => buildRows(artifacts, expanded, expandedActions, collapsed),
    [artifacts, expanded, expandedActions, collapsed],
  );

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const viewportHeight = Math.max(
    3,
    (stdout.rows ?? 24) -
      HEADER_LINES -
      CONTROLS_LINES -
      (agentState !== null ? DOCKED_MAX_LINES : 0),
  );

  useEffect(() => {
    setScrollOffset((offset) => {
      if (cursor < offset) return cursor;
      if (cursor >= offset + viewportHeight) return cursor - viewportHeight + 1;
      return offset;
    });
  }, [cursor, viewportHeight]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setAgentState((prev) => (prev ? { ...prev, elapsed: prev.elapsed + 1 } : null));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const { isRawModeSupported } = useStdin();

  useInput(
    (input, key) => {
      if (phase === "running") {
        if (key.ctrl && input === "c") {
          process.kill(process.pid, "SIGINT");
        }
        return;
      }

      if (key.upArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => Math.min(rows.length - 1, c + 1));
        return;
      }

      const currentRow = rows[cursor];
      if (currentRow?.type === "artifact") {
        const id = fm(currentRow.artifact).id;
        if (key.leftArrow && currentRow.hasChildren && !currentRow.isCollapsed) {
          setCollapsed((prev) => new Set([...prev, id]));
          setExpanded(null);
          setExpandedActions([]);
          return;
        }
        if (key.rightArrow && currentRow.hasChildren && currentRow.isCollapsed) {
          setCollapsed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }
      }

      if (!currentRow) return;

      if (key.return) {
        if (currentRow.type === "artifact") {
          const id = fm(currentRow.artifact).id;
          if (expanded === id) {
            setExpanded(null);
            setExpandedActions([]);
          } else {
            const actions = computeArtifactActions(id, artifacts);
            setExpanded(id);
            setExpandedActions(actions);
            // Move cursor to first action row (will be index cursor+1 after rerender)
            setCursor((c) => c + 1);
          }
          return;
        }

        if (currentRow.type === "action" && currentRow.actionIndex !== -1) {
          const { command } = currentRow.action;
          const runningArtifactId = extractArtifactId(command);

          setAgentState({ command, elapsed: 0, recentCalls: [], runningArtifactId });
          setExpanded(null);
          setExpandedActions([]);
          setPhase("running");

          const callbacks: ExecuteCallbacks = {
            onAgentStart: (role: string) => {
              setAgentState((prev) => (prev ? { ...prev, command: `${role}: ${command}` } : null));
            },
            onToolCall: (e: ToolCallEvent) => {
              setAgentState((prev) => {
                if (!prev) return null;
                const entry = `${e.name.padEnd(14)}${e.path}`;
                return { ...prev, recentCalls: [...prev.recentCalls, entry].slice(-4) };
              });
            },
          };

          void dispatchReplCommand(command, callbacks).then((code) => {
            if (code !== 0) {
              setAgentState((prev) =>
                prev
                  ? {
                      ...prev,
                      recentCalls: [...prev.recentCalls, `✗ failed (code ${code})`].slice(-4),
                    }
                  : null,
              );
              setTimeout(() => {
                setAgentState(null);
                setPhase("idle");
                refresh();
              }, 1500);
            } else {
              setAgentState(null);
              setPhase("idle");
              refresh();
            }
          });
          return;
        }
      }

      if (key.escape) {
        setExpanded(null);
        setExpandedActions([]);
        return;
      }

      if (input === "r") {
        refresh();
        return;
      }

      if (input === "q") {
        onExit(0);
      }
    },
    { isActive: isRawModeSupported },
  );

  if (scanError !== null) {
    return (
      <Box paddingX={1}>
        <Text color="red">{scanError}</Text>
      </Box>
    );
  }

  if (artifacts.length === 0) {
    return (
      <Box paddingX={1} paddingY={2}>
        <Text dimColor>{"No artifacts found. Run `pet init` to scaffold doc/."}</Text>
      </Box>
    );
  }

  const currentRow = rows[cursor];
  const onActionRow = currentRow?.type === "action" && currentRow.actionIndex !== -1;

  const visibleRows = rows.slice(scrollOffset, scrollOffset + viewportHeight);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, rows.length - scrollOffset - viewportHeight);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          pet
        </Text>
        <Text dimColor>
          {" pipeline tree"}
          {rows.length > 0 ? `  ${cursor + 1}/${rows.length}` : ""}
        </Text>
      </Box>

      {aboveCount > 0 && <Text dimColor>{`  ↑ ${aboveCount} more`}</Text>}

      {visibleRows.map((row, i) => {
        const absoluteIndex = scrollOffset + i;
        const focused = absoluteIndex === cursor;
        if (row.type === "artifact") {
          const id = fm(row.artifact).id;
          return (
            <TreeRowView
              key={id}
              row={row}
              focused={focused}
              expanded={expanded === id}
              agentRunning={agentState?.runningArtifactId === id}
            />
          );
        }
        return (
          <ActionRowView
            key={`action-${row.actionIndex}-${row.action.command}`}
            row={row}
            focused={focused}
          />
        );
      })}

      {belowCount > 0 && <Text dimColor>{`  ↓ ${belowCount} more`}</Text>}

      {agentState !== null && <DockedStrip state={agentState} />}

      <Box marginTop={1}>
        {phase === "running" ? (
          <Text dimColor>[Ctrl-C] abort</Text>
        ) : onActionRow ? (
          <Text dimColor>{"↑↓ navigate  ↵ run  Esc back"}</Text>
        ) : (
          <Text dimColor>
            {"↑↓ navigate  ↵ actions  ←▶/→▼ collapse/expand  Esc back  r refresh  q quit"}
          </Text>
        )}
      </Box>
    </Box>
  );
}
