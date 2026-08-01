# 9. Discovery reconciliation: feature-enrichment stage

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Both `pet new feature` and the FeatureDesigner emit a _scaffold_ — a title and empty `##`
headings. A scaffold is not a decision; it is a placeholder for one. This collides with
ADR-0007: if a human accepts a feature while its body is still a scaffold, the immutability
rule freezes an empty document, and the actual acceptance criteria can never be written.

Ordering matters here — this stage exists because ADR-0007 exists, and its carve-out is
scoped precisely to this case.

## Decision

`reconcileForFeature` (`src/controllers/discovery-lead.ts`):

**`proposed` or `accepted` with a scaffold body → spawn DesignerEnrich.** The brief carries
the feature body and the full body of its solution hypothesis.

**Non-scaffold body → idle.** Discovery is finished with this feature; delivery takes over
(ADR-0021).

Any other status is an error, as is a feature with no `solution_hypothesis_id`.

Two implementation points that are decisions, not accidents:

- **DesignerEnrich is not a new role.** It is the `designer` role with a second prompt,
  selected by command kind (`src/agents/load-prompt.ts`). `spawn_feature_designer` and
  `spawn_designer_enrich` both map to `designer` in the executor. Adding an `AgentRole` per
  prompt variant would multiply the permission matrix (ADR-0014) for no gain.
- **The immutability validator carries an explicit carve-out** for completing an
  accepted-but-scaffold feature exactly once. It is scoped to this transition and to
  features, and it is the only body-level exception in the codebase.

## Consequences

Positive: accepting a feature slightly early is recoverable rather than permanent. The
scaffold predicate is a pure function of the body, so the state is computed, never stored.

Negative: `featureBodyIsScaffold` is a heuristic over heading structure. A genuinely
minimal but real feature body could be misread as a scaffold and get re-enriched; a
scaffold with one stray sentence could be misread as real and become frozen. The heuristic
is the weak point of this design and there is no better signal available without adding
state.

The carve-out weakens ADR-0007 at exactly one point. Accepted as the lesser cost: the
alternative is a class of permanently empty accepted features.
