---
id: FEAT-0004
status: proposed
solution_hypothesis_id: SOL-0003
architectural_review_status: pending
---

# Code-to-artifact link index

## Context

SOL-0003 proposes a `pet trace <path|symbol>` command that walks the artifact graph
from a code location back to the problem hypothesis that motivated it. Before any
narrative can be generated, the system needs a reliable way to answer one question:
_given a file path or symbol name, which artifact IDs are related to it?_

The artifact graph (FEAT-0001 through FEAT-0003) is traversable from artifact to
artifact, but the graph has no entry point at the code layer. Without an explicit
code-to-artifact index, the trace agent would have to perform a full-text search
across every artifact file on every invocation — slow, noisy, and sensitive to
wording inconsistencies. A lightweight, incrementally maintained index file provides
a stable, fast entry point that both the CLI and any downstream agent can query
deterministically.

This feature is a prerequisite for FEAT-0005 (`pet trace` CLI). It does not produce
user-visible output on its own; its value is realized entirely through the commands and
agents that consume it.

## Decision

Introduce a code-to-artifact link index stored at `product/context/code-links.json`
(or the configured artifact root equivalent). The index maps source file globs and
optional symbol names to one or more artifact IDs.

### Index schema (example)

```json
{
  "version": 1,
  "entries": [
    {
      "path": "src/cli/trace.ts",
      "symbols": ["runTrace"],
      "artifact_ids": ["FEAT-0005", "SOL-0003"]
    },
    {
      "path": "src/schemas/**",
      "artifact_ids": ["FEAT-0002"]
    }
  ]
}
```

**Fields:**

- `path` — a file path or glob relative to the repo root. Required.
- `symbols` — optional list of exported function/class/constant names within that file.
  When present, the entry is treated as more specific than a path-only entry.
- `artifact_ids` — one or more artifact IDs (any prefix: FEAT, SOL, PROB, ADR, TASK)
  that are causally related to the code at this path.

**Authorship:** entries are written by humans at PR time (encouraged by the
`pet capture` hook from SOL-0002) and by the reconciler agent when it creates or
updates features and tasks. The index is committed to the repo like any other artifact.

**Out of scope for this feature:**

- Automatic static analysis to infer links (e.g. AST-based symbol extraction). Links
  are always declared, never inferred, to keep the index trustworthy.
- A UI or interactive editor for the index. Plain JSON edited by humans or agents is
  sufficient.
- Bidirectional validation (confirming that every artifact referenced in the index
  exists) — that is handled by the integrity validator in FEAT-0003.

## Acceptance criteria

- `product/context/code-links.json` (or configured equivalent) is recognized by
  `scripts/validate.ts` as a known file; its presence is not required but its schema
  is validated when present.
- A JSON Schema (or equivalent Zod definition) for `code-links.json` is published in
  `src/schemas/`; a file that violates the schema fails `pet validate` with a
  descriptive error identifying the offending entry.
- An entry with `"path": "src/cli/trace.ts"` and `"artifact_ids": ["FEAT-0005"]`
  causes `pet trace src/cli/trace.ts` (FEAT-0005) to resolve FEAT-0005 as the starting
  artifact without an LLM call.
- An entry with a glob path (e.g. `"src/schemas/**"`) matches all files under
  `src/schemas/` when the CLI performs a lookup.
- A symbol-qualified entry (path + symbols) takes precedence over a path-only entry
  for the same file when the caller supplies a symbol name.
- `pet validate --integrity` reports an error for any `artifact_ids` value in
  `code-links.json` that does not resolve to a file in the artifact store (leveraging
  FEAT-0003 resolution rules).
- The index lookup used by `pet trace` completes in under 50 ms for an index containing
  1 000 entries on commodity hardware.
- Unit tests cover: exact path match, glob match, symbol-qualified match taking
  precedence, unknown artifact ID flagged by integrity check, missing index file
  treated as empty (no error).

## Consequences

**Positive:**

- `pet trace` gains a fast, deterministic entry point into the artifact graph; the LLM
  agent only needs to walk the graph from a known starting artifact, not discover it.
- The index doubles as human-readable documentation of which code paths are
  intentionally product-driven vs. purely technical.
- Agents writing new features or tasks can populate the index as part of artifact
  creation, keeping coverage self-reinforcing.

**Negative / risks:**

- The index must be kept up to date manually (or by agent) as files are renamed or
  refactored. A stale entry pointing to a moved file silently misses the lookup;
  a lint rule checking that `path` entries resolve to real files (or matching globs)
  should be added as a follow-on.
- Glob entries are powerful but can over-match. An entry of `"**"` would associate
  every file with an artifact, which is vacuously true and useless. Validation should
  warn when a glob matches more than a configurable threshold (e.g. 200 files).
- The schema version field (`version: 1`) must be incremented if the shape changes, and
  a migration path provided, to avoid silent breakage in teams that have populated the
  index under the old schema.
