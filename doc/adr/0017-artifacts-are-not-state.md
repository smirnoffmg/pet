# 17. Artifacts are not state

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

ADR-0007 freezes accepted decision artifacts. That rule only works if decision artifacts do
not also carry fast-moving state. The moment a `status` field that changes weekly lives on
an immutable artifact, every routine update becomes an immutability violation, and the
pressure to add exceptions becomes irresistible until the rule means nothing.

The distinction is not about which fields are convenient. A _decision_ is a claim about
what should be true, made at a point in time. _State_ is what happens to be true right now.
They have opposite requirements: decisions must not change, state must.

## Decision

**`task` is the only mutable kind.** It moves `todo → in_progress → review → done` and is
excluded from `DECISION_KINDS`, so the immutability validator skips it entirely. A task is
work, not a decision; the decision it implements is the feature above it.

Everything genuinely stateful lives off the decision layer:

- **`doc/product/orchestration/decisions.md`** — append-only audit trail. Written by
  controllers and the executor, never read back for decision-making (ADR-0011).
- **`~/.local/share/pet/<repo-hash>/sessions/<invocation-id>/`** — logs and session data,
  keyed by a hash of the repository, outside the repo, deletable with `pet clean` with no
  loss.

The prohibition is stated as a rule for future work: if a field like `lastRunAt`,
`pendingTasks`, or `currentCycle` is being added to a decision artifact, the state is being
modelled on the wrong layer.

## Consequences

Positive: the immutability rule has no exceptions to negotiate on the decision layer.
Session data is disposable, so nothing is lost by clearing it and no migration is ever
needed for it.

Negative: tasks are second-class — mutable, and excluded from the validation guarantees the
other kinds get, so a task can be edited to say anything with no check. Progress reporting
that would naturally be a field (how far along is this feature?) has to be derived by
counting related tasks on every read.

The decision/state line is a judgement call at the edges. `architectural_review_status` on
features is the clearest case: it is workflow state living on a decision artifact, and it
needed an explicit carve-out in the immutability validator rather than fitting cleanly on
either side.
