---
id: MET-0003
status: accepted
---

# Onboarding time-to-first-independent-decision

## Context

New team members on small teams currently spend 2–4 weeks asking "why does this work this
way?" questions that senior engineers must answer synchronously. The cost is paid twice:
the new hire is unproductive and the senior engineer is interrupted. This metric tracks
whether colocating strategic context in the repo shortens that ramp.

## Decision

Measure the elapsed calendar time from a new team member's first commit to their first
pull request that introduces or modifies a product artifact (hypothesis, ADR, feature
file) _without requiring synchronous input from a senior team member_.

"Independent" is defined as: the PR is authored without a recorded pairing session,
async clarification thread, or reviewer-requested rationale rewrite.

**Target:** Reduce median time-to-first-independent-decision from the baseline (measured
at adoption) by ≥ 50 % within two onboarding cohorts.

## Consequences

Improvement: new hires self-serve strategic context from the repo; senior engineers
reclaim interrupted focus time.  
No improvement: the structured artifact store exists but is either incomplete, hard to
navigate, or not consulted — pointing to a discoverability or tooling gap rather than a
content gap.
