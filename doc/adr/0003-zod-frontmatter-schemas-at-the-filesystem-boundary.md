# 3. Zod frontmatter schemas at the filesystem boundary

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Frontmatter is untyped YAML produced by two untrustworthy sources: humans editing markdown
by hand, and LLM agents generating files. A `as FeatureFrontmatter` cast at the read site
would be a lie that propagates — a missing `solution_hypothesis_id` would surface as
`undefined` three call frames later, inside a controller, as a confusing crash rather than
a parse error naming the file.

## Decision

Every artifact kind has a Zod schema in `src/schemas/`. Parsing happens exactly once, at
the filesystem boundary, in `parseArtifactFile` (`src/store/parse.ts`); everything
downstream trusts the parsed type.

Supporting constraints, adopted together as one position on where errors are allowed to
live:

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- `@typescript-eslint/no-explicit-any` is an error. Genuinely unknown data is `unknown` and
  must be parsed before use.
- IDs are branded types (`src/schemas/ids.ts`), so a `FeatureId` cannot be passed where a
  `MetricId` is expected even though both are strings at runtime.
- Failures are values, not exceptions: `neverthrow`'s `Result<T, E>` and named error classes
  (`src/errors/`). Production code does not `throw new Error(...)`.
- Named exports only, and the `@/` path alias instead of relative `../../` chains.

## Consequences

Positive: a malformed artifact is reported once, by filename, with the failing field. The
type system carries FK direction, so a whole class of wiring mistakes is a compile error.
`Result` makes every failure path visible at the call site.

Negative: schema changes are two edits, the Zod schema and any dependent refinement, and
`withSupersessionRefine` returns a `ZodEffects`, so `.extend()` is unavailable on refined
schemas — new fields must go inside the inner `z.object`. This surprises people.

`scanArtifacts` fails the entire scan when any single file fails validation, so one bad
artifact blocks every command rather than degrading to a partial view. Deliberate: a
partial view of a decision store invites decisions based on missing data.
