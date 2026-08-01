# 11. Controllers are stateless reconcilers

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

The orchestration layer decides which agent runs next. The conventional implementation is a
workflow engine: a stored plan, a cursor into it, retry counters, a notion of "current
cycle". Every one of those is a second source of truth about the state of the work. When
the repository and the engine disagree — and they will, because people edit files, abandon
branches, and revert — the engine wins, and it is wrong.

## Decision

Controllers are pure functions of a snapshot:

    (ArtifactSnapshot, target) → { commands } | { reason }

No controller in `src/controllers/` holds module-level mutable state. State is recomputed
by scanning `doc/product/` on every invocation. Fields like `lastRunAt`, `pendingTasks`, or
`currentCycle` are prohibited by this ADR; if the answer is not derivable from the current
contents of the repository, it is not knowable.

Controllers do not write artifacts. They emit spawn commands; the executor
(`src/agents/executor.ts`) runs them; the subagent's own sandboxed backend performs writes
(ADR-0014). The separation makes "which agent may write where" a static, auditable fact.

`doc/product/orchestration/decisions.md` is append-only and **write-only from the
controller's perspective** (`src/controllers/orchestration-log.ts`). It is an audit trail
for humans. No controller reads it to decide anything — the moment one did, it would be
state.

## Consequences

Positive: any command can be interrupted, re-run, or run on a different machine and
converge to the same answer. Controllers are testable as pure functions with no fixtures
beyond a snapshot. Deleting `~/.local/share/pet/` loses nothing that matters.

Negative: everything is recomputed on every invocation, so cost is a full scan per command
(bounded by ADR-0001's scale ceiling). Genuinely sequential multi-step work cannot be
expressed as a stored plan and must be re-derived each time, which makes some transitions
awkward to encode as predicates over artifact state.

There is no retry memory: a failed spawn leaves no record that it was attempted, so a
re-run repeats it. Accepted — the alternative is exactly the drift this ADR exists to
prevent.
