# 1. The filesystem is the database

Date: 2026-06-06

## Status

Accepted

## Context

This record was written on 2026-07-31, well after the decision took effect. `doc/adr/` did
not exist while the code that embodies these decisions was being written — the omission is
itself an instance of the intent debt this project exists to address, and is recorded here
rather than quietly backdated.

`pet` stores product decisions: problem hypotheses, metrics, solution hypotheses, features,
tasks, QA plans, releases. The obvious implementations are a database, a hosted issue
tracker, or a wiki. All three share a property that defeats the purpose: the decision record
lives somewhere other than the code it explains. It is reviewed separately if at all, it
drifts as the code moves, and when the system is decommissioned the explanation dies with
the service that hosted it.

A decision record is only trustworthy if it was written at the moment of the decision and
has been under the same scrutiny as the code ever since.

## Decision

Markdown files with YAML frontmatter, committed to the repository under `doc/`, are the
only persistent artifact store. No database, no ORM, no external state service.

Consequences of that choice, made deliberately:

- Artifacts are reviewed in the same pull request as the code they justify.
- `git log` and `git blame` are the audit trail; no separate history mechanism is built.
- The only state outside the repository is disposable session data under
  `~/.local/share/pet/<repo-hash>/`, which `pet clean` deletes without loss.
- Reads are a directory scan (`src/store/scan.ts`), writes are file writes
  (`src/store/write.ts`), and `gray-matter` is the entire storage layer.

## Consequences

Positive: zero infrastructure to run the tool; artifacts diff, merge, and review like code;
the store survives any tool that reads it, including `pet` itself; offline by default.

Negative: no indexes and no queries — every lookup is a full scan, which bounds the design
to repositories with hundreds of artifacts rather than millions. No transactions across
files; commands that must be atomic implement write-validate-rollback by hand (see
ADR-0010). Concurrent writers are not coordinated; git merge conflicts are the resolution
mechanism.

Accepted as the right trade: the scale ceiling is far above any single product team, and
colocation with code is the property the whole project is built on.
