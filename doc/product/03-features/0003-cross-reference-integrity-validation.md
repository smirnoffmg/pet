---
id: FEAT-0003
status: proposed
solution_hypothesis_id: SOL-0001
architectural_review_status: pending
---

# Cross-reference integrity validation

## Context

SOL-0001's core claim is that the artifact graph — problem → solution → feature → task —
must be traversable from the repo alone. FEAT-0002 establishes the schema that makes
cross-reference fields machine-readable. But a file can have a syntactically valid
`solution_hypothesis_id: SOL-0009` even when no such artifact exists. Broken references
silently degrade the graph: a contributor following the chain hits a dead end, and the
promise of full traceability is broken.

The risk is noted explicitly in SOL-0001's trade-offs:

> "The artifact graph is only as useful as the cross-references are accurate; broken or
> missing `problem_hypothesis_id` links degrade retrievability."

This feature closes that gap by making broken cross-references a CI failure rather than
a silent defect. It is a foreign-key constraint for the Markdown graph.

## Decision

Extend `scripts/validate.ts` with a referential integrity pass that runs after schema
validation. For every cross-reference field in every artifact, the pass must:

1. Resolve the referenced ID to a file in the expected directory
   (e.g. `SOL-0001` → `02-solution-hypotheses/0001-*.md`).
2. Confirm the resolved file's `id` frontmatter field matches the reference exactly.
3. Confirm the resolved file's `status` is not `rejected` or `deprecated` (a feature
   pointing at a rejected solution hypothesis is a likely authoring error; emit a
   warning, not an error, to allow intentional references with an explicit override
   comment).
4. Emit a structured error listing: referencing file, field name, unresolvable ID.

The integrity pass must be runnable standalone (`pet validate --integrity`) and as part
of the full validation suite. It must also be exposed as a GitHub Actions step so that
pull requests introducing broken references are blocked before merge.

Reference resolution rules:

- ID format `XXX-NNNN` maps to directory by prefix: `PROB` → `00-problem-hypotheses/`,
  `MET` → `01-metrics/`, `SOL` → `02-solution-hypotheses/`, `FEAT` → `03-features/`,
  `TASK` → `04-tasks/`, `ADR` → `05-adrs/`.
- Within the directory, match on filename numeric prefix (`NNNN`) rather than full
  filename, so renames of the slug portion do not break references.

## Acceptance criteria

- `pet validate --integrity` on the current repo exits with code 0 (all existing
  references resolve).
- Introducing a feature file with `solution_hypothesis_id: SOL-9999` (no such file)
  causes `pet validate --integrity` to exit with code 1 and print the referencing file
  path, field name, and unresolvable ID.
- Introducing a feature file referencing a `rejected` solution hypothesis emits a
  warning (exit code 0) with a message indicating the referenced artifact's status.
- The GitHub Actions workflow runs `pet validate --integrity` on every pull request; a
  PR that introduces a broken reference fails the check.
- Resolution is by numeric prefix: renaming `0001-old-title.md` to `0001-new-title.md`
  does not break any existing reference to `SOL-0001`.
- Unit tests cover: valid graph passes, missing target fails, wrong-directory ID fails,
  deprecated-target warning, numeric-prefix rename tolerance.

## Consequences

**Positive:**

- Broken links become a caught defect rather than silent data rot.
- Agents generating artifact files get immediate feedback when they hallucinate an ID.
- The graph's traversability guarantee can be tested mechanically, not just asserted.

**Negative / risks:**

- Validation must be fast enough to run in a pre-commit hook; a repo with hundreds of
  artifacts must complete the integrity pass in under two seconds. Performance must be
  benchmarked as part of delivery.
- The warning-vs-error distinction for references to rejected artifacts introduces
  judgement calls; teams may prefer to treat all such references as errors. The
  behaviour should be configurable in `pet.config.json`.
- If two artifact files share the same numeric prefix (should be prevented by FEAT-0002
  schema validation), resolution is ambiguous. The integrity pass must treat this as an
  error and prompt the author to resolve the collision.
