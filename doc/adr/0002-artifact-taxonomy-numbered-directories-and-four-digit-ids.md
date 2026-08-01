# 2. Artifact taxonomy, numbered directories, and four-digit IDs

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001 for why this series was backfilled.

Given a filesystem store (ADR-0001), artifacts need a location and a name. Two properties
are in tension: a human browsing `doc/product/` should see the pipeline order at a glance,
and a reference from one artifact to another must survive renaming, retitling, and moving
the file.

Titles change. Paths change when a task is archived. Neither can be the identifier.

## Decision

One numbered directory per artifact kind, ordered by position in the pipeline:

    doc/product/00-problem-hypotheses/   hypothesis            PROB-NNNN
    doc/product/01-metrics/              metric                MET-NNNN
    doc/product/02-solution-hypotheses/  solution_hypothesis   SOL-NNNN
    doc/product/03-features/             feature               FEAT-NNNN
    doc/product/04-tasks/                task                  TASK-NNNN
    doc/product/05-qa-plans/             qa_plan               QA-NNNN
    doc/product/06-releases/             release               REL-NNNN
    doc/adr/                             ADR                   ADR-NNNN

Identity is a `PREFIX-NNNN` string in frontmatter, zero-padded to four digits, branded at
the type level (`src/schemas/ids.ts`). Filenames are `NNNN-kebab-slug.md`, where `NNNN`
must equal the ID's numeric suffix — a mismatch is a validation error
(`src/validators/filename.ts`).

Numbers are allocated as `max(existing) + 1` by `pet new` (`src/store/allocate.ts`,
`src/store/adr.ts`). IDs are never hand-picked.

## Consequences

Positive: the directory listing teaches the pipeline; sorting by filename sorts by age;
the ID is stable across every rename and move the file will ever undergo. Slug truncation
at 80 characters keeps paths workable.

Negative: `max + 1` allocation is not safe against two people creating an artifact of the
same kind on parallel branches — both get the same number and the merge conflicts. This is
noisy but loud, which is preferred over silent duplicate IDs.

The numeric prefix in the filename duplicates the ID, so the two can disagree; the filename
validator exists precisely to catch that. Directory numbering encodes pipeline order, so
inserting a new stage in the middle would mean renumbering directories — accepted, since
the seven-stage chain is the product, not an implementation detail.
