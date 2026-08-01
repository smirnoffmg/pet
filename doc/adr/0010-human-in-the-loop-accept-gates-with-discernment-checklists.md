# 10. Human-in-the-loop accept gates with discernment checklists

Date: 2026-06-07

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

`accepted` is the irreversible transition (ADR-0007). If an agent could set it, immutability
would protect text the agent wrote and nobody read — the store would fill with confident,
unexamined decisions, which is a worse failure than having no store at all.

There is also a subtler problem. A confirmation prompt that appears hundreds of times
becomes a reflex; "are you sure?" trains people to press `y`.

## Decision

**Only `pet accept <kind> <id>` promotes `proposed → accepted`.** No agent, no reconciler,
no controller writes that status.

**Every gate prints a per-kind discernment checklist first** (`src/cli/discernment.ts`) —
concrete claims about _this_ artifact, not a generic warning: "hypothesis is falsifiable",
"feature has real acceptance criteria", "release includes a rollback procedure". The
checklist gives the prompt something to be about.

**The confirmation defaults to no.** `confirm({ default: false })`, so a reflexive Enter
declines.

**The write is atomic.** Patch frontmatter, revalidate the whole repository, and restore the
original bytes if validation fails (`atomicFrontmatterUpdate`, `src/cli/atomic-update.ts`).
A rejected promotion leaves nothing behind.

**Agents reach the gate only through a human.** `accept_artifact` exists as an orchestrator
tool, but it is reachable only from `pet chat`, where a person is in the loop and asked. It
is not available to pipeline subagents.

`pet reject` follows the same shape with its own checklist (ADR-0025).

## Consequences

Positive: every immutable artifact was seen by a person who was given specific things to
check. `--yes` exists for scripted and test use and is documented as such.

Negative: the pipeline cannot run unattended end to end — deliberate, but it makes `pet` a
poor fit for batch automation. Checklists are static text and drift from what the schemas
actually enforce; nothing keeps them in sync.

`--yes` skips the checklist entirely, so a script can promote artifacts nobody read. The
flag is the honest escape hatch rather than a hidden one, but it is an escape hatch.
