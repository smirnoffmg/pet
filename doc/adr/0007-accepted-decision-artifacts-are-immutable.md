# 7. Accepted decision artifacts are immutable

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31. That this rule's own record was missing for two months
is not a small irony: the project's central claim is that decisions must be written down
when they are made, and the decision to make decisions immutable was not.

The value of a decision store is not that it holds the current plan — a wiki does that. It
is that it holds what was believed at the time, so that a later reader can reconstruct why
a choice looked right. Editing an accepted artifact in place destroys exactly that. The
edited document reads as though the team always knew what it knows now, and the reasoning
that led to the original choice becomes unrecoverable.

## Decision

Once an artifact of a decision kind is committed with `status: accepted`, its body and its
frontmatter are frozen. `validateImmutability` (`src/validators/immutability.ts`) enforces
this by comparing the working tree against `git show HEAD:<path>`.

The only permitted mutations on an accepted artifact:

- `superseded_by`, set to the ID of the artifact that replaces it;
- `status`, flipped to `superseded` in the same change;
- `architectural_review_status` on features — a workflow flag, not decision content;
- completing a feature whose committed body was still an empty scaffold, exactly once
  (see ADR-0009).

Change happens by writing a **new** artifact carrying `supersedes: <old-id>`. The old body
is never touched.

`superseded` and `rejected` artifacts are frozen outright — not even the supersession
fields may change. A closed decision is closed, including the rationale that closed it.

Decision kinds are `metric`, `hypothesis`, `solution_hypothesis`, `feature`, `release`,
`qa_plan` (`DECISION_KINDS`, `src/schemas/index.ts`). `task` is excluded; see ADR-0017.

Artifacts not yet committed, and committed artifacts still in `proposed`, are freely
editable. The rule attaches to acceptance, not to existence.

## Consequences

Positive: history is reconstructable from the artifacts alone, without archaeology through
`git log`. The supersession chain shows how thinking changed, which is usually more useful
than the final state.

Negative: fixing a typo in an accepted artifact requires superseding it, which is
disproportionate — so typos stay. Judged worth it: a rule with exceptions for "small"
edits has no enforceable boundary.

The check depends on git. Outside a repository with history it prints
`Warning: no git history found — immutability checks skipped` and passes, so tests and
fresh scaffolds are not blocked. This is a real hole: an artifact accepted and committed in
the same operation as its edit is never compared. Pre-commit and CI close it in practice.
