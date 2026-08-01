# 24. Orchestrator as a top-level interactive role

Date: 2026-07-12

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Every role so far is spawned by a Lead controller with a structured brief aimed at one
artifact (ADR-0020). A conversational role breaks all three assumptions: there is no brief,
there is no single target artifact, and it has to survive many turns. Questions like "what
should I do next?" or "why was SOL-0002 rejected?" have no reconciler that produces them.

## Decision

**`orchestrator` is a role in every mechanical sense** — a prompt file, a
`permissionsForRole` case, an MCP allow-list entry (ADR-0012) — **but it is wired into a CLI
command rather than a controller.** `pet chat` runs it. Its `buildUserMessage` returns the
empty string and it takes no brief; the user's turns are the input.

**It is read-only on `doc/` except `product/orchestration/**`.** It can read any artifact to
answer questions. It writes no artifact itself. Every artifact write happens inside a
spawned subagent's own backend, under that subagent's own permissions — the orchestrator
reaches them through tools: `orchestrate_step`, `accept_artifact`, `analyze_pipeline`,
`create_artifact`.

This keeps ADR-0014 intact. A conversational agent with write access would be a single role
able to touch everything, which is precisely the hole the permission matrix exists to close.

**`accept_artifact` is available to it, `reject_artifact` is not** (ADR-0025). Acceptance in
chat still involves a human being asked in the same conversation; discarding an alternative
does not get an automated path at all.

**Conversation history is held in process for the session and not persisted.** A stored
conversation would be state that outlives the repository scan and start disagreeing with it
(ADR-0011).

**Bare `pet` opens the Tree UI, not the orchestrator.** The zero-argument command should not
be the one that costs money.

## Consequences

Positive: a natural-language entry point exists without weakening the permission model or
introducing persistent state. The tools it calls are the same code paths the CLI commands
use, so chat and CLI cannot drift apart.

Negative: it is the one role that does not fit the controller pattern, so "how do I add a
role?" now has two answers. Losing conversation history on exit is a real cost for long
exploratory sessions.

Every artifact write is one indirection further away, which makes chat-driven work harder
to trace than the equivalent explicit command — the orchestration log is the only record
that the step happened.
