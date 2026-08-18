# 26. Accept gate refuses content-incomplete artifacts

Date: 2026-08-18

## Status

Proposed

## Context

A live dogfooding run (pet-example, 2026-08-18) produced an accepted metric whose
body was an untouched scaffold, and an accepted hypothesis whose own Evidence
section flagged it as "not yet falsifiable". Both passed `pet accept --yes`
because the gate checked only the status transition (`proposed → accepted`),
never the body, and `--yes` skipped the discernment checklist — the single place
where a human might have noticed.

The root imbalance: pet enforces immutability of the past deterministically, but
treats content readiness as nobody's responsibility. The state machine permitted
transitions the role model could not justify — a `pet new metric` scaffold could
be accepted although no agent role ever enriches standalone metrics. Immutability
then amplified the error: whatever slipped through the weak gate froze forever.

Downstream effects observed in the same run: SolutionDesigner, unable to judge
what an empty accepted metric measures, kept it as a dangling reference, created
a parallel metric, and re-defined the upstream metric inline in its own success
criteria — a lower layer papering over a hole in the layer above.

Related contributing defects fixed alongside (not part of this decision but
recorded here for the trail): agents had no clock and invented ADR dates
(fixed by injecting today's date into every agent system prompt), and the
SolutionDesigner prompt instructed prose-"rejected" alternatives inside the
winner's Decision section, contradicting ADR-0025's human-only rejection
(prompt reconciled: alternatives are drafted as sibling proposed SOL- files).

## Decision

`pet accept` refuses to promote any artifact whose body is a scaffold (title
only) or contains at least one empty `##` section. The refusal names the empty
sections. The check applies to all seven accept paths (hypothesis, metric,
solution hypothesis, feature, QA plan, release, ADR), runs before any prompt,
and cannot be bypassed: `--yes` skips interactivity (checklist and confirmation
prompt), never checks. There is deliberately no `--force` override — an accepted
artifact is immutable, so the gate must not freeze a record that does not yet
contain its decision.

Two supporting alignments make the gate satisfiable:

1. **Templates match role coverage.** A template scaffolds only the sections
   some role — or the human at creation time — is responsible for filling:
   hypothesis = Context + Evidence (Researcher), metric = Decision + How we
   measure (human or SolutionDesigner), solution hypothesis = Decision +
   Success criteria (SolutionDesigner or human), release = title only (DevOps
   appends Deployment Checklist and Rollback Plan). Feature, task, and QA plan
   templates were already covered by their roles.

2. **Enrich before accept.** A scaffold feature is enriched while `proposed`
   (DesignerEnrich already handled `proposed`); the previous
   accept-then-enrich ordering is retired.

## Consequences

Positive:

- An accepted artifact now provably contains _some_ answer in every section it
  carries; the "empty decision frozen forever" failure mode is structurally
  impossible.
- `--yes` regains a safe meaning for scripting and demos: it automates
  confirmation, not judgment about content that is absent.
- Discovery-lead, `pet next`, and orchestrator scaffold detection are unchanged
  — they already keyed off the same `featureBodyIsScaffold` / `anySectionEmpty`
  predicates the gate now reuses.

Negative / trade-offs:

- The gate checks presence, not quality — a section containing one filler
  sentence passes. Judging quality remains the human's job via the discernment
  checklist; this ADR only closes the "nobody even looked" hole.
- Mock agents must write minimally realistic bodies (they previously wrote
  scaffolds), and e2e fixtures simulate the human filling sections before the
  gate — test setup got slightly heavier.
- Artifacts accepted before this ADR may contain empty sections; the gate is
  not retroactive (validation does not re-check accepted artifacts) and the
  immutability rule forbids fixing them in place. Supersede if it matters.
- A human who genuinely wants to accept early must delete the unused section
  header while the artifact is `proposed` — deliberate, visible in the diff.

Alternatives rejected:

- _Warn instead of block:_ a warning scrolling past in a `--yes` run is exactly
  the failure mode being fixed.
- _`--force` escape hatch:_ every caller of `--yes` would eventually cargo-cult
  `--force`, restoring the status quo.
- _Quality scoring via LLM at the gate:_ violates the "no LLM calls in
  deterministic paths" constraint and makes the gate non-reproducible.
