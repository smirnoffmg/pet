---
id: PROB-0001
status: proposed
target_metric_ids:
  - MET-0001
---

# Small teams lose strategic context when product decisions live outside the codebase

## Context

Small engineering teams (1–5 people) manage product work through external tools — Jira, Notion,
Confluence, Linear — that are separate from the codebase. These tools are migrated, deprecated,
or abandoned on a cadence faster than the product itself. Team members leave. Strategic context
("why did we build X?", "why did we abandon Y?", "what did we try before?") becomes unretrievable.

## Decision

We believe small teams and solo engineers face a persistent problem: product decisions made today
are invisible one year later because they live in external, mutable, tool-specific stores. The
cost is paid three times:

1. **At handoff** — strategic context from discovery (user research, hypothesis rationale) is
   stripped when converted to a ticket. The ticket describes _what_, never _why_.
2. **At migration** — each tool switch destroys history that wasn't exported. Most teams
   accept this loss rather than invest in migration tooling.
3. **At onboarding** — new team members can't learn from past decisions without finding the
   right person to ask. Institutional knowledge is a person, not a document.

## Evidence

- Teams routinely re-debate decisions made 12–18 months prior with no record of the original
  reasoning or the alternatives that were rejected.
- Post-mortems regularly surface "we tried this before" without any record of why it failed.
- Onboarding engineers report spending 2–4 weeks asking "why does this work this way?" questions
  that would be answerable from docs — if the docs existed.

## How we measure

See MET-0001 (Product decision retrieval success rate). If solved, any team member can navigate
to a feature, task, or ADR and trace the full chain of reasoning — problem → solution hypothesis
→ feature → implementation — without asking anyone.

## Consequences

If solved: product knowledge persists through team changes, tool migrations, and long project
timelines. New hires become productive faster. Past mistakes are not repeated.

If unsolved: teams continue to re-debate settled decisions, strategic context accumulates only
in long-tenured engineers, and each tool migration resets institutional memory to zero.
