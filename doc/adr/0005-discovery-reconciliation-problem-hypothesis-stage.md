# 5. Discovery reconciliation: problem-hypothesis stage

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

`pet discover --hypothesis PROB-NNNN` must decide which subagent, if any, to spawn. The
decision has to come from the artifact's current state alone — there is no stored plan and
no memory of previous runs (ADR-0011). This ADR fixes the rules for the `PROB-` stage.

## Decision

`reconcileForHypothesis` (`src/controllers/discovery-lead.ts`) applies exactly three rules:

**`proposed` → spawn Researcher.** Unconditionally, including when the `## Evidence`
section is already populated. Re-running enriches rather than skips; a hypothesis that has
not passed its human gate is still open for more evidence. The brief carries the
hypothesis title and full body.

**`accepted` with no active solution hypothesis → spawn SolutionDesigner.** "Active" is
computed by walking backwards: solution hypotheses whose `metric_ids` reach a metric whose
`problem_hypothesis_id` is this hypothesis, excluding rejected and superseded ones. The
brief embeds the bodies of every linked metric so the agent needs no lookups (ADR-0020).

**`accepted` with an active solution hypothesis → idle.** Zero commands, not an error.
Discovery for this hypothesis is done; the next move belongs to a later stage.

Any other status — `validated`, `invalidated`, `superseded` — is an **error**, not idle. A
settled hypothesis is not a thing you run discovery on, and silently doing nothing would
hide the user's mistake.

## Consequences

Positive: the rule set is a pure function of the snapshot, so it is unit-testable without
agents and idempotent by construction (ADR-0008). Re-running on converged state is free
and emits no log lines.

Negative: unconditional Researcher spawning on `proposed` means an impatient user can burn
tokens re-researching an already-well-evidenced hypothesis. This is accepted; the
alternative — guessing whether evidence is "enough" — is a judgement the tool should not
make silently.

Note a real divergence: `reconcileOrchestrator` (`src/controllers/orchestrator.ts`) gates
the same transition on the Evidence section being empty. That is deliberate but
undocumented in the code — the orchestrator picks _one_ next action across the whole
repository, so it needs a priority heuristic that a targeted `pet discover` does not. The
contract in this ADR is normative for `pet discover`; the orchestrator's extra predicate is
a ranking rule, not a different contract.
