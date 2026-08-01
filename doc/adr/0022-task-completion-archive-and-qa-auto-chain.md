# 22. Task completion, archive, and QA auto-chain

Date: 2026-06-16

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Completed tasks accumulate. Since every command scans all artifacts (ADR-0004), finished
work makes every listing noisier and every scan slower, permanently. Meanwhile the step
after "the last task is done" — writing the QA plan — was the one people reliably forgot,
because nothing prompted it.

Doing this by hand means four separate operations that must all succeed together: set
status, stamp completion metadata, move the file, revalidate. Done manually they routinely
were not all done.

## Decision

**`pet task done <id>` is the sanctioned path.** It:

1. sets `status: done`;
2. stamps `completed_at` and `commit_sha` from `git rev-parse HEAD`;
3. moves the file into `04-tasks/archive/`;
4. revalidates the repository;
5. **rolls back both the frontmatter edit and the move** if validation fails.

**Archived tasks stay resolvable.** `src/store/paths.ts` maps the archive subdirectory back
to kind `task`, so FKs pointing at an archived task still resolve (ADR-0004). Archiving is
a filesystem concern; identity is unaffected.

**The task body is never edited.** Not by this command, not afterwards. The body records
what was known while the work was active; git history preserves it and the archived file
keeps it as it was.

**Marking the last open task of an accepted feature done auto-chains into
`pet qa --feature`.** The one place a transition is automatic, because it is unambiguous —
the feature has no remaining work and no QA plan, so there is exactly one next move. It is
also bound to `d` on a focused task row in the Tree UI.

`pr_url` is not set by this command; it is added by hand if tracked.

## Consequences

Positive: the active task list stays the list of live work. Completion metadata is
consistent because one code path writes it. The forgettable step is no longer forgettable.

Negative: the auto-chain spends money without a separate prompt for the chained command,
which is surprising the first time. Rollback restores the file but not `completed_at`
precision if re-run, and the two-phase rollback (rename then rewrite) has a window where a
crash leaves the task moved but unvalidated.

Archiving is one-directional; there is no `pet task reopen`. Reopening means moving the file
back by hand.
