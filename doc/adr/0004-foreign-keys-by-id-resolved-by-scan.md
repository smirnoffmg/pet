# 4. Foreign keys by ID, resolved by scan

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Artifacts reference each other: a feature names the solution hypothesis it implements, a
metric names the problem hypothesis it measures. In a markdown store the tempting encoding
is a relative link — `[SOL-0001](../02-solution-hypotheses/0001-colocate.md)`. Those rot on
the first `git mv`, and archiving a completed task moves files by design (ADR-0022).

## Decision

Cross-artifact references are ID strings in frontmatter, never paths. The chain is:

    TASK / QA → FEAT → SOL → MET → PROB

`PROB` is the root and holds no outbound FK. Each edge is a named frontmatter field:
`DevTask.feature_id`, `QaPlan.feature_id`, `Release.feature_ids[]`,
`Feature.solution_hypothesis_id`, `SolutionHypothesis.metric_ids[]`,
`TargetMetric.problem_hypothesis_id`.

Resolution is a full scan of the artifact directories into a
`Map<ArtifactId, ParsedArtifact>` (`buildIndex`, `src/store/scan.ts`). `validateForeignKeys`
(`src/validators/fk.ts`) checks every edge resolves, and runs in CI and pre-commit.

Because resolution is by scan and not by path, moving a file cannot break a reference —
`src/store/paths.ts` maps `04-tasks/archive/` back to kind `task` so archived tasks stay
resolvable.

## Consequences

Positive: files can be renamed, retitled, and archived freely. Referential integrity is
checked deterministically with no LLM involvement and no network. The FK chain is
machine-readable, which is what makes graph retrieval (ADR-0020) possible.

Negative: reading an artifact's neighbours costs a full directory scan, so tools resolve
the whole graph up front rather than lazily. Reference errors are found at validation time,
not at edit time; an editor writing `SOL-9999` sees the mistake on `pet validate`, not on
save.

Known gap: FK validation is status-blind. A feature may reference a `rejected` or
`superseded` solution hypothesis and still validate. FEAT-0003 records that it should not;
until that is implemented, `pet reject` warns about live dependents rather than blocking.
