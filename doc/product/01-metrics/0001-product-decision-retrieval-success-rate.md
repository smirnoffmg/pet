---
id: MET-0001
status: accepted
problem_hypothesis_id: PROB-0001
---

# Product decision retrieval success rate

## Context

Small teams accumulate strategic context through discussions, design sessions, and async threads
in external tools. As tools change and team members leave, this context becomes inaccessible.

## Decision

Measure whether any team member — including a new hire — can answer "why did we build / decide / abandon X?"
solely from the git repository, without access to Slack archives, Confluence, or any external tool.

A decision is "retrievable" if its rationale, alternatives considered, and constraints are all
present in a version-controlled artifact reachable from the affected code or feature.

## Consequences

High retrieval rate: institutional knowledge survives team changes and tool migrations.
Low retrieval rate: strategic context is siloed in volatile external systems and in the heads
of long-tenured engineers.
