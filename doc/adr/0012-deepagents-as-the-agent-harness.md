# 12. deepagents as the agent harness

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Running an LLM agent needs a tool-calling loop, streaming, a filesystem the model can
address, and per-invocation permissioning. Building that is weeks of work that has nothing
to do with the actual product, which is the artifact model and the pipeline discipline
around it.

## Decision

Use the `deepagents` package as the harness: `createDeepAgent` plus a `FilesystemBackend`
rooted at `doc/` in virtual mode (`src/agents/run-agent.ts`). Agent-visible paths therefore
start at `/`, and no agent can address anything outside `doc/`.

**A role is not a TypeScript module.** There is one generic `run-agent.ts`. A role consists
of exactly three registrations:

1. a markdown prompt in `src/prompts/<role>.md`;
2. a `permissionsForRole` case in `src/agents/path-permissions.ts` (ADR-0014), plus a
   `ROLE_MCP_SERVERS` entry if it needs tools (ADR-0023);
3. a `KIND_TO_ROLE` mapping in `src/agents/executor.ts`.

`src/agents/orchestrator.ts` is the sole exception, for the reasons in ADR-0024.

**Prompts are loaded from disk at runtime**, not inlined into the bundle; the esbuild config
copies `src/prompts/` to `dist/prompts/`. Prompts are the part most likely to be edited by
someone who is not rebuilding, and treating them as data rather than code keeps that cheap.

## Consequences

Positive: adding a role is a prompt plus two table entries, small enough that roles stay
cheap to try. The permission matrix stays in one file instead of being scattered across
per-role modules.

Negative: a hard dependency on a young package. Its `createDeepAgent` signature, streaming
event shape (`streamEvents(..., {version: "v3"})`), and backend semantics are load-bearing
and would each need replacing if the package moved. There is no abstraction layer over it —
deliberately, since a wrapper written before a second harness exists would be guesswork.

Runtime prompt loading means a missing or misnamed prompt file is a runtime failure rather
than a build error, and the dist layout must be kept in step with the source layout.
