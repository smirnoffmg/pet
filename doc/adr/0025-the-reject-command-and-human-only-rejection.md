# 25. The reject command and human-only rejection

Date: 2026-07-31

## Status

Proposed

## Context

The solution hypothesis schema has carried `rejected` as a status and required
`rejection_rationale` alongside it since the schemas were written. Nothing could produce
that state. The word `reject` did not appear anywhere in `src/cli/`, so the only way to
record a rejected alternative was to hand-edit markdown — which the project's own rules
forbid, because bypassing the CLI is how malformed artifacts get in.

The gap was not cosmetic. Preserving alternatives that lost is the central claim of this
artifact model: a decision store that keeps only the winners records what was done but not
what was chosen against, and the second is what a reader two years later actually needs.
The tool asserted it held rejected alternatives and offered no way to reject one.

Unlike ADR-0001 through ADR-0024, this record is written before the decision is settled.
It is `Proposed` and awaits `pet accept adr 25`.

## Decision

**Add `pet reject solution-hypothesis <id> --rationale <text>`**
(`src/cli/reject-cmd.ts`), following the shape of the accept gates in ADR-0010: checklist,
confirmation defaulting to no, atomic write with rollback on validation failure.

Specific choices:

**Rationale is mandatory and checked before anything is written.** A missing `--rationale`
produces a sentence telling the user what to type, not a Zod trace. The schema would catch
it anyway; catching it earlier is the difference between an error message and a stack trace.

**Only `proposed → rejected`.** Retiring an `accepted` decision is supersession, not
rejection, and the command says so and points at the supersession flow. This is not merely
a policy — the immutability validator (ADR-0007) would reject the transition anyway, since
`rejection_rationale` is a new key on an accepted artifact. Catching it in the command turns
a validator error into an explanation.

**The transition is written to the orchestration log**, after validation succeeds. This is
the first CLI decision to appear there; the accept commands do not log, which is an
inconsistency worth closing later.

**Live dependents warn, they do not block.** FK validation is status-blind (ADR-0004), so a
feature may still reference a rejected solution. FEAT-0003 says the validator should catch
this and it currently does not; until then the command names the affected features rather
than pretending the problem is absent.

**`rejected` is visible in output.** `pet list` marks it `×`, distinct from `~ proposed` and
`- superseded`; the Tree UI colours it red and shows the rationale when the row is expanded,
since a rejected artifact has no next action and its rationale is the only thing worth
reading.

**No `reject_artifact` agent tool.** `accept_artifact` exists for the orchestrator
(ADR-0024) because a human is in that conversation and is asked. Rejection gets no
automated path at all. An agent may draft alternatives; discarding one is the judgement the
whole pipeline exists to keep in human hands, and automating it would hollow out the same
gate ADR-0010 protects.

**Rejection stays specific to solution hypotheses.** `PROB-` has `validated`/`invalidated`,
`SOL-` has `rejected`, and the rest have only supersession. That asymmetry is intentional
and now documented in the README: a problem hypothesis is a claim reality settles, a
solution hypothesis is a choice a human settles, and everything else is replaced rather
than refuted.

## Consequences

Positive: the central claim of the artifact model is now executable rather than aspirational.
A rejected alternative and its reasoning are preserved in the same immutable, reviewable
form as everything else, and `rejected` artifacts are frozen on commit like any closed
decision.

Negative: the rationale cannot be corrected after commit, so a hasty wording is permanent.
The confirmation prompt says this, but people will still be surprised.

The command is CLI-only. Tree UI action rows execute fixed command strings and cannot
collect free text, so rejection cannot be triggered from the tree — a gap that would need
a prompt overlay to close.

Rejecting a solution that still has live features leaves those features tracing to
abandoned intent. The warning makes it visible; only implementing the FEAT-0003 status
check would make it impossible.
