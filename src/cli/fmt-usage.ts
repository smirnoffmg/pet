import type { RunUsage } from "@/agents/session-stats.js";

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtUsage(u: RunUsage): string {
  return `${fmtTokens(u.inputTokens)} in / ${fmtTokens(u.outputTokens)} out · ~$${u.costUsd.toFixed(3)}`;
}
