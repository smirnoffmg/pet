/**
 * Classifies failures thrown out of `runLiveAgent`.
 *
 * A weak model routinely hallucinates a path outside its allow-list. The
 * permission layer refuses the write — which is the system working — but
 * deepagents surfaces that refusal as a thrown error that aborts the graph.
 * Treating every throw as a permission-boundary failure would therefore report
 * the boundary as broken at exactly the moment it did its job.
 *
 * Per ADR-0018 the two verdicts must stay separate: a refused write is a model
 * capability failure (soft); anything else is a real defect (hard).
 */

import { isModelFault } from "@/agents/model-fault.js";

function collectMessages(error: unknown, depth = 0): string[] {
  if (error === null || error === undefined || depth > 8) return [];

  const out: string[] = [];

  if (error instanceof Error) {
    out.push(error.message);
    // AggregateError from langgraph carries the per-task failures here.
    const nested = (error as { errors?: unknown }).errors;
    if (Array.isArray(nested)) {
      for (const inner of nested) out.push(...collectMessages(inner, depth + 1));
    }
    out.push(...collectMessages((error as { cause?: unknown }).cause, depth + 1));
    return out;
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record["message"] === "string") out.push(record["message"]);
    if (Array.isArray(record["errors"])) {
      for (const inner of record["errors"]) out.push(...collectMessages(inner, depth + 1));
    }
    out.push(...collectMessages(record["cause"], depth + 1));
    return out;
  }

  if (typeof error === "string") out.push(error);
  return out;
}

/** The paths the agent was refused, for a legible soft-failure message. */
export function deniedPaths(error: unknown): string[] {
  const paths = new Set<string>();
  for (const message of collectMessages(error)) {
    const match = /permission denied for (?:write|read|edit) on (\S+)/i.exec(message);
    if (match?.[1]) paths.add(match[1]);
  }
  return [...paths];
}

export interface AgentOutcome {
  /** Non-null only for failures that are NOT the model's fault. */
  fatal: unknown;
  /** Paths the permission layer refused; empty when the agent stayed in bounds. */
  denied: string[];
  /** Human-readable summary of model faults, for the soft assertion message. */
  faults: string[];
}

/**
 * Runs an agent and separates "the model misbehaved and was refused" from "the
 * code broke". Callers must rethrow `fatal`; `faults` belongs in a soft assertion.
 */
export async function runAgentCapturingDenials(run: () => Promise<unknown>): Promise<AgentOutcome> {
  try {
    await run();
    return { fatal: null, denied: [], faults: [] };
  } catch (error) {
    if (isModelFault(error)) {
      const denied = deniedPaths(error);
      const faults =
        denied.length > 0 ? denied.map((p) => `refused write: ${p}`) : ["malformed tool call"];
      return { fatal: null, denied, faults };
    }
    return { fatal: error, denied: [], faults: [] };
  }
}
