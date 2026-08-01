# 14. Per-role filesystem permissions for subagents

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

ADR-0007 makes accepted artifacts immutable, but that rule is enforced by a validator that
runs at commit time. An agent with write access to all of `doc/` can silently rewrite an
accepted decision, and nothing notices until someone commits — by which point the agent's
output has already been reviewed on the assumption that it only touched what it was asked
to touch.

Immutability needs enforcement at the point of writing, not only at the point of committing.

## Decision

Every role gets an explicit allow-list in `permissionsForRole`
(`src/agents/path-permissions.ts`), terminated by a catch-all:

    { operations: ["write"], paths: ["/**"], mode: "deny" }

Deny-by-default. A path not named is not writable.

The shape of the matrix:

- every role may **read** `/adr/**` and `/product/**` — context is cheap and hiding it
  produces worse output;
- almost every role **writes exactly one directory**, the one holding the artifact kind it
  produces;
- two roles write two: Architect (`/adr/**` and `/product/03-features/**`, since it clears
  architectural review) and SolutionDesigner (metrics and solution hypotheses);
- the Orchestrator writes only `/product/orchestration/**` (ADR-0024).

The backend is virtual and rooted at `doc/` (ADR-0012), so agent-visible paths begin at `/`
and nothing outside `doc/` is addressable at all — the permission matrix governs what
happens inside an already-bounded space.

## Consequences

Positive: "which agent can write what" is one readable table rather than an emergent
property. A prompt-injected or confused agent cannot corrupt artifacts outside its lane.
Reviewing a new role's blast radius is reading one case.

Negative: the matrix is a second place to update when adding a role, and forgetting it
produces a confusing "permission denied" rather than a clear "role not registered".

Path permissions are enforced by the harness, so the guarantee is only as strong as
`deepagents`' implementation of them; this is a dependency on correctness in someone else's
code. The e2e suite that asserts these boundaries treats permission assertions as hard
failures for exactly that reason (ADR-0018).
