# 6. Discovery reconciliation: solution-hypothesis stage

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

A solution hypothesis is a proposed way to move a metric. Fanning it out into features is
the expensive, hard-to-reverse step: features spawn architecture review, tasks, QA plans.
Two failure modes matter. Fanning out before a human has agreed to the solution wastes the
work and, worse, creates artifacts that imply agreement that never happened. Fanning out
twice produces duplicate features nobody asked for.

## Decision

`reconcileForSolutionHypothesis` (`src/controllers/discovery-lead.ts`):

**`accepted` with no `proposed`/`accepted` feature → spawn FeatureDesigner.** The brief
walks the FK chain upward — `SOL → metric_ids[0] → MET → problem_hypothesis_id → PROB` —
and embeds the metric and problem-hypothesis bodies, so the designer sees what the solution
is ultimately for (ADR-0020).

**`accepted` with features already present → idle.** Zero commands.

**`proposed` → idle, by design.** There is deliberately no agent that fills in a proposed
solution hypothesis. The human writes the mechanism, the risks, and the success criteria,
then runs `pet accept`. This is the one stage with no automated drafting, because it is the
stage where the choice among alternatives is actually made — and delegating that to an
agent would hollow out the `accept` gate (ADR-0010).

Any other status — `rejected`, `superseded` — is an error.

## Consequences

Positive: the accept gate is load-bearing and cannot be routed around. Idempotence falls
out of the "already has features" check.

Negative: a proposed solution hypothesis with an empty body is a dead end until a human
writes it; `pet next` will keep pointing at it. That friction is the intended shape.

The "no proposed/accepted feature" check counts features across the whole repository, so
deliberately adding a _second_ wave of features to an accepted solution is not possible
through this path — the reconciler will report idle. Superseding the solution hypothesis is
the sanctioned way to reopen it. Alternatives that lose are recorded with `pet reject`
rather than deleted, so the fan-out that did not happen stays visible.
