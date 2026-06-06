---
id: SOL-0002
status: accepted
problem_hypothesis_id: PROB-0001
target_metric_id: MET-0002
---

# CLI-assisted decision capture at commit time

## Context

PROB-0001 identifies three cost centers for lost strategic context. The first — the
**handoff cost** — is the moment when a rich product decision is compressed into a ticket
that records _what_ but drops _why_. This loss is not intentional; it happens because
capturing rationale requires switching context to a separate tool, and that friction is
high enough that it is routinely skipped.

SOL-0001 establishes the correct store (versioned Markdown in the repo). This hypothesis
addresses the authoring friction: even with the right store, context will not be captured
unless the act of writing it is embedded in the developer's existing workflow.

The `pet` CLI already provides commands that create and update artifact files. The
missing piece is a lightweight prompt — surfaced at commit or PR time — that asks "which
product artifact does this change relate to?" and guides the author to either link an
existing artifact or create a new one in under 60 seconds.

## Decision

We believe that **integrating a `pet` capture prompt into the git commit workflow** (via
a prepare-commit-msg or post-commit hook, or a `pet commit` wrapper command) will raise
MET-0002 (decision capture rate at handoff) to ≥ 80 % for product-facing changes within
30 days of adoption.

The hypothesis is:

> If developers are prompted to link or create a product artifact at the moment they
> commit product-facing code — without leaving the terminal — then the proportion of
> decisions recorded at the time of the decision will increase, because the marginal cost
> of capture drops to below the threshold of "I'll do it later" deferral.

## Experiments

1. **Baseline measurement (week 1):** Audit the last 20 product-facing PRs. Count how
   many include a traceable link to a rationale document (MET-0002 baseline). Expect
   near-zero.

2. **Hook experiment (week 2–5):** Enable the `pet` commit hook for one team. The hook
   surfaces a one-question prompt: "Does this commit relate to a product artifact?
   [link existing / create new / skip]". Skips are logged. Measure MET-0002 weekly.

3. **Skip-rate analysis (week 6):** Examine logged skips. If skip rate > 30 %, interview
   3 developers about why they skipped. Determine whether friction is the prompt UX,
   the artifact structure, or genuine irrelevance (chore commits, etc.). Adjust
   accordingly.

## Success criteria

- MET-0002 capture rate ≥ 80 % for product-facing PRs at 30 days.
- Median time to complete the capture prompt ≤ 60 seconds (measured from hook trigger
  to commit completion).
- Skip rate for non-chore commits ≤ 20 %.

## Consequences

**If confirmed:** the handoff cost collapses. Rationale is written while the decision is
fresh, not reconstructed weeks later (or never). MET-0001 (retrieval success rate) should
improve as a downstream effect.

**If refuted:** developers skip the prompt regardless of its brevity. This would suggest
the problem is motivational rather than frictional — teams do not yet value the artifact
store enough to maintain it. A prerequisite would then be demonstrating retrieval value
(SOL-0001 must prove its worth before SOL-0002 is adopted).

**Trade-offs and risks:**

- A commit hook that adds latency or feels nagging will be disabled immediately. The UX
  must be skippable with a single keypress.
- Chore commits (dependency bumps, formatting) must be excluded from the prompt
  automatically to avoid false noise.
- The hook alone cannot force quality; a link to a stub artifact satisfies the metric
  without adding real context. Periodic artifact health reviews are needed.
