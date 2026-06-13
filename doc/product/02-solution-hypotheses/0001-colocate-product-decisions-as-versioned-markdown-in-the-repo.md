---
id: SOL-0001
status: accepted
metric_ids:
  - MET-0001
---

# Colocate product decisions as versioned Markdown in the repo

## Context

PROB-0001 identifies that strategic context is lost because it lives in external,
tool-specific stores (Jira, Notion, Confluence, Linear) that are migrated or abandoned on
a cadence faster than the product itself. The root cause is structural: the store is
wrong, not the people or the process.

Git is already the one artifact that every engineering team version-controls, migrates
faithfully, and treats as the source of truth for _what_ was built. If the _why_ lived in
the same store, it would survive every tool migration automatically.

The `pet` toolkit already models this: problem hypotheses, solution hypotheses, metrics,
features, ADRs, and releases are all structured Markdown files with YAML frontmatter
stored under `doc/product/` (or `/product/` in the artifact store). Each artifact has a
stable ID, a filename that doubles as a human-readable slug, and cross-references that
form a traversable knowledge graph entirely within the repo.

## Decision

We believe that **adopting the `pet` artifact directory structure as the single canonical
store for product decisions** — and committing to keeping it inside the git repository —
will raise MET-0001 (product decision retrieval success rate) to ≥ 90 % within 90 days
of consistent use.

The hypothesis is:

> If all product decisions (problem hypotheses, solution hypotheses, ADRs, feature
> rationale) are expressed as version-controlled Markdown files linked by stable IDs,
> then any team member can trace the full reasoning chain for any feature or decision
> from the repo alone, without access to any external tool.

This is the foundational solution. SOL-0002 and SOL-0003 layer tooling on top of it, but
this hypothesis is valuable even without them: a team that manually maintains these files
will already beat the status quo.

## Experiments

1. **Seed experiment (week 1–2):** Backfill the three most-debated decisions from the
   last 12 months as `00-problem-hypotheses/` and `02-solution-hypotheses/` entries.
   Measure whether team members can answer "why did we do X?" from the repo alone after
   backfill (MET-0001 baseline).

2. **Forward-capture experiment (week 3–8):** For every new product decision, require a
   corresponding artifact file before the work is considered "started". Track MET-0001
   weekly to observe the rate of improvement.

3. **Tool-migration simulation (week 9–12):** Revoke access to whichever external tool
   the team currently uses for product context for one sprint. Measure whether any
   decisions become unretrievable (MET-0001 stress test).

## Success criteria

- MET-0001 retrieval success rate ≥ 90 % at 90 days.
- Zero decisions lost during a simulated tool-migration sprint.
- New team members report being able to answer "why did we build X?" from the repo
  without asking a colleague, for at least 3 out of 5 sampled decisions.

## Consequences

**If confirmed:** the repo becomes a self-contained institutional memory. Tool migrations
are no longer destructive events. Onboarding cost drops because knowledge is findable
rather than person-dependent.

**If refuted:** the artifact structure exists but is not consulted or not kept up to date.
This would point to a maintenance friction problem (addressed by SOL-0002) or a
discoverability problem (addressed by SOL-0003) rather than invalidating the core
approach.

**Trade-offs and risks:**

- Requires discipline to maintain; files not written at decision time are rarely written
  later.
- Markdown + YAML has a higher authoring cost than a Slack message or a Jira comment.
  Tooling (SOL-0002) must reduce this cost to make the habit stick.
- The artifact graph is only as useful as the cross-references are accurate; broken or
  missing `problem_hypothesis_id` links degrade retrievability.
