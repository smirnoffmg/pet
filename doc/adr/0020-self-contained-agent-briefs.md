# 20. Self-contained agent briefs

Date: 2026-06-13

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

A subagent needs its upstream context: a FeatureDesigner needs the solution hypothesis, the
metric it moves, and the problem behind it. The obvious approach is to let the agent find
them — it has read access to `/product/**` (ADR-0014) and can `ls` and `read_file`.

In practice that costs several turns before any work starts, and weaker models spend those
turns guessing at paths that do not exist (ADR-0015). The controller already knows exactly
which artifacts are relevant, because it walked the FK chain to decide the agent should run
at all.

## Decision

**Controllers resolve the FK chain and embed the full bodies of linked artifacts in the
brief.** The agent receives everything it needs and performs no lookups. The
SolutionDesigner brief carries the metric bodies; the FeatureDesigner brief carries the
solution hypothesis, its metric, and the problem hypothesis; the DesignerEnrich brief
carries the feature and its solution hypothesis.

**The Researcher additionally gets graph retrieval**, because "what else is relevant here"
is not answerable from the FK chain alone. `src/retrieval/` builds an adjacency map over
artifact IDs and does a breadth-first walk from the target: at most two hops, scored with
decay by distance, superseded artifacts excluded, top five kept, each body truncated to 500
characters, appended as a `## Related artifacts (graph context)` block.

The bound is deliberate: unbounded context is how a focused brief becomes the entire
repository pasted into a prompt.

## Consequences

Positive: agents start working on their first turn. Behaviour is far more stable across
model tiers, since finding context no longer requires tool-use competence. What the agent
saw is reconstructable from the brief alone, which makes failures debuggable.

Negative: briefs are large, so a stage's token cost scales with the size of its upstream
artifacts rather than with the work. Embedding full bodies duplicates content that also
exists on disk; if an artifact changes mid-run the brief is stale.

The retrieval bounds — two hops, five artifacts, 500 characters — are unvalidated constants.
They were chosen to be obviously safe rather than tuned, and truncation can cut a body
mid-sentence.
