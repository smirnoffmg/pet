---
id: SOL-0003
status: accepted
metric_ids:
  - MET-0003
---

# Agent-generated onboarding trace from code to rationale

## Context

PROB-0001 identifies three cost centers for lost strategic context. The third —
the **onboarding cost** — is the 2–4 week period during which new team members cannot
answer "why does this work this way?" without interrupting a senior engineer.
Institutional knowledge is a person, not a document.

SOL-0001 ensures the documents exist. SOL-0002 ensures they are written at the right
time. This hypothesis addresses discoverability: even with a complete artifact store,
a new hire must know to look for it, know the ID scheme, and be able to navigate from a
line of code back to the product rationale that motivated it.

The `pet` toolkit models product work as a traversable graph: code → feature → solution
hypothesis → problem hypothesis → metric. An LLM reconciler agent can walk this graph
given a starting point (a file path, a function name, a PR number) and produce a
narrative trace: "This code exists because of feature F-0012, which was designed to test
SOL-0003, which was proposed to address PROB-0001."

## Decision

We believe that **a `pet trace <path|symbol>` command** — which walks the artifact graph
from a code location to its originating problem hypothesis and emits a human-readable
narrative — will reduce MET-0003 (onboarding time-to-first-independent-decision) by
≥ 50 % within two onboarding cohorts.

The hypothesis is:

> If a new team member can run a single command against any file or function and receive
> a concise narrative explaining the chain of reasoning that produced it — without
> reading the entire artifact store or asking a colleague — then the time required to
> reach productive, independent decision-making will decrease significantly.

## Experiments

1. **Artifact coverage prerequisite (before experiment):** Confirm that ≥ 70 % of
   product-facing code paths are linked to at least one artifact (SOL-0001 + SOL-0002
   must be partially validated first). If coverage is below this threshold, the trace
   will produce too many dead ends to be useful.

2. **Trace quality experiment (week 1–2):** Present 5 senior engineers with `pet trace`
   output for 10 code paths they know well. Ask them to rate narrative accuracy on a
   1–5 scale and to flag any missing context. Use feedback to calibrate the agent prompt.

3. **Onboarding A/B experiment (cohort 1 vs cohort 2):** Give cohort 1 the existing
   onboarding materials (README, external tool access). Give cohort 2 `pet trace` access
   plus the artifact store, with no external tool access. Measure MET-0003 for both
   cohorts.

4. **Self-service ratio (ongoing):** Track the ratio of onboarding questions answered by
   `pet trace` output vs. synchronous senior-engineer time. Target: ≥ 60 % self-served
   by end of cohort 2.

## Success criteria

- MET-0003 time-to-first-independent-decision reduced by ≥ 50 % (cohort 2 vs cohort 1).
- `pet trace` narrative rated ≥ 4/5 for accuracy by senior engineers on ≥ 80 % of
  sampled code paths.
- ≥ 60 % of onboarding clarification questions answered without synchronous senior input
  by end of cohort 2.

## Consequences

**If confirmed:** new team members become independently productive faster; senior
engineers reclaim interrupted focus time. The artifact store proves its value through a
concrete, measurable productivity gain — reinforcing the habits required to maintain it
(SOL-0001, SOL-0002).

**If refuted:** the trace narrative is generated but not trusted or not consulted.
Possible causes:

- Artifact coverage is too low → fix upstream with SOL-0001/SOL-0002.
- The narrative is too verbose or too abstract → refine agent prompt.
- New hires prefer synchronous learning regardless of tooling → the onboarding cost may
  require a different intervention (structured pairing schedule, video walkthroughs).

**Trade-offs and risks:**

- This hypothesis depends on SOL-0001 and SOL-0002 being partially validated first.
  Running it on a sparse artifact store will produce misleading negative results.
- LLM-generated narratives can hallucinate links or summarize incorrectly. Traces must
  cite specific artifact IDs so readers can verify the source.
- The command adds a dependency on LLM availability at query time; teams in air-gapped
  environments need a static fallback (pre-generated trace documents).
