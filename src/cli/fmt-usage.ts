import type { RunUsage } from "@/agents/session-stats.js";

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtUsage(u: RunUsage): string {
  const base = `${fmtTokens(u.inputTokens)} in / ${fmtTokens(u.outputTokens)} out`;
  // Only shown when the cache actually did something — an unconditional "0%
  // cached" on every non-Anthropic run would be noise.
  const cached =
    u.inputTokens > 0 && u.cacheReadTokens > 0
      ? ` · ${Math.round((u.cacheReadTokens / u.inputTokens) * 100)}% cached`
      : "";
  return `${base}${cached} · ~$${u.costUsd.toFixed(3)}`;
}
