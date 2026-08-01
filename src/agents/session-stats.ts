import { estimateUsdFromTokens } from "./usage.js";
import type { TokenUsage } from "./usage.js";

export type RunUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
};

const emptySession = (): RunUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
});

let _last: RunUsage | null = null;
let _session: RunUsage = emptySession();
let _sessionRuns = 0;

export function recordUsage(usage: TokenUsage): void {
  const costUsd = estimateUsdFromTokens(usage);
  _last = { ...usage, costUsd };
  _session.inputTokens += usage.inputTokens;
  _session.outputTokens += usage.outputTokens;
  _session.totalTokens += usage.totalTokens;
  _session.cacheCreationTokens += usage.cacheCreationTokens;
  _session.cacheReadTokens += usage.cacheReadTokens;
  _session.costUsd += costUsd;
  _sessionRuns += 1;
}

export function getLastRunUsage(): RunUsage | null {
  return _last;
}

export function getSessionUsage(): RunUsage {
  return { ..._session };
}

export function getSessionRuns(): number {
  return _sessionRuns;
}

export function resetLastRunUsage(): void {
  _last = null;
}

export function resetSession(): void {
  _last = null;
  _session = emptySession();
  _sessionRuns = 0;
}
