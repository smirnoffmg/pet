---
id: MET-0002
status: accepted
problem_hypothesis_id: PROB-0001
---

# Decision capture rate at handoff

## Context

When a product decision is made — a feature scoped, an approach selected, an alternative
rejected — the rationale exists in its richest form at that moment. Current workflows
convert this moment into a ticket that records _what_ to build but drops _why_. The
capture rate measures how often that "why" is preserved before the moment passes.

## Decision

Measure the proportion of merged pull requests (or completed tasks) that include a
traceable link to a version-controlled artifact (problem hypothesis, solution hypothesis,
ADR, or feature file) containing the decision rationale _at the time of merge_.

A handoff is "captured" if:

1. The commit, PR description, or accompanying artifact references a rationale document
   reachable from the affected code path.
2. That document records at minimum: the problem being solved, the option chosen, and at
   least one alternative considered.

**Target:** ≥ 80 % of PRs on product-facing changes captured within 30 days of
adoption.

## Consequences

High capture rate: decision context is recorded while knowledge is fresh; handoff cost
drops to near zero.  
Low capture rate: rationale continues to live only in PR comments, Slack threads, and
memory — all volatile stores.
