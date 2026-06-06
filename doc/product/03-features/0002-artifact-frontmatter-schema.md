---
id: FEAT-0002
status: proposed
solution_hypothesis_id: SOL-0001
target_metric_id: MET-0001
architectural_review_status: pending
---

# Artifact frontmatter schema

## Context

The retrievability guarantee in SOL-0001 depends on more than files existing in the right
directories. For any team member (or agent) to trace the full reasoning chain
`problem → metric → solution → feature → task`, each artifact must carry a consistent,
machine-readable header that declares:

- its own stable ID
- its lifecycle status
- links to parent artifacts (e.g. a feature must name its `solution_hypothesis_id`)

Without a codified schema, IDs drift (some files use `FEAT-`, others `feat-`, others
nothing), status values are free-text, and cross-reference fields are omitted or
misspelled. The graph degrades silently; `scripts/validate.ts` cannot catch problems it
has no schema to compare against.

The `pet` artifact model currently handles this with Zod schemas in source. This feature
makes the schema the explicit, documented contract that governs every artifact file
written by humans or agents.

## Decision

Define and enforce a canonical YAML frontmatter schema for each of the six artifact
types. Each schema must specify required fields, allowed status values, and which
cross-reference fields are required vs. optional.

### Schema summary

| Artifact            | Required fields                                                                     | Status values                                      |
| ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Problem hypothesis  | `id` (PROB-NNNN), `status`                                                          | `draft`, `accepted`, `rejected`                    |
| Metric              | `id` (MET-NNNN), `status`                                                           | `draft`, `active`, `deprecated`                    |
| Solution hypothesis | `id` (SOL-NNNN), `status`, `problem_hypothesis_id`                                  | `draft`, `accepted`, `rejected`                    |
| Feature             | `id` (FEAT-NNNN), `status`, `solution_hypothesis_id`, `architectural_review_status` | `proposed`, `accepted`, `rejected`, `delivered`    |
| Task                | `id` (TASK-NNNN), `status`, `feature_id`                                            | `pending`, `in_progress`, `done`, `cancelled`      |
| ADR                 | `id` (ADR-NNNN), `status`                                                           | `proposed`, `accepted`, `superseded`, `deprecated` |

Filename convention: `NNNN-<kebab-case-title>.md` where `NNNN` is the same numeric
suffix as the `id` field. Mismatch between filename number and `id` number is a
validation error.

Schemas are implemented as Zod definitions in `src/schemas/` and exported for use by
both `scripts/validate.ts` and any agent that reads or writes artifacts.

## Acceptance criteria

- `src/schemas/` contains one Zod schema per artifact type, each enforcing the fields
  listed in the table above.
- `scripts/validate.ts` uses the Zod schemas to validate every artifact file under the
  artifact root; validation errors reference the file path and the failing field.
- A file with an `id` of `FEAT-0003` stored as `0005-some-title.md` fails validation
  with a clear message about the ID/filename mismatch.
- A feature file missing `solution_hypothesis_id` fails validation.
- A feature file missing `architectural_review_status` fails validation.
- All existing artifact files in this repo pass validation after this feature is
  delivered.
- Unit tests cover: valid artifact passes, missing required field fails, ID/filename
  mismatch fails, unknown status value fails.

## Consequences

**Positive:**

- Agents can read frontmatter and trust its structure without defensive parsing.
- Humans get immediate, actionable error messages when they omit required fields.
- The schema acts as living documentation of the data model — it is the spec.

**Negative / risks:**

- Adding a new required field to an existing schema is a breaking change; all existing
  files must be migrated. A field-addition policy (required fields can only be added in
  a major version bump, or with a migration script) should be documented in the ADR that
  accompanies this feature.
- Zod schema evolution must be coordinated with any agents that generate artifacts;
  agents using a cached system prompt may produce files that fail validation against a
  newer schema.
