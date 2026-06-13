---
id: FEAT-0001
status: proposed
solution_hypothesis_id: SOL-0001
architectural_review_status: pending
---

# Artifact directory scaffold

## Context

SOL-0001 bets that colocating product decisions in the git repository — rather than
in external tools — will make those decisions durable and retrievable. Before any artifact
can be written or validated, the repo must contain an agreed-upon directory layout that
all contributors (human and agent) treat as canonical.

Without a committed, documented scaffold, teams default to ad-hoc locations: a `docs/`
folder here, a `decisions/` folder there, no consistent numbering scheme, and no
separation between artifact types. This makes cross-referencing unreliable and breaks
any tooling that expects a stable path.

The `pet` model prescribes six first-class artifact directories under a single root
(`doc/product/` in the consuming repo, `/product/` in the toolkit's own artifact store):

| Directory                 | Artifact type                 |
| ------------------------- | ----------------------------- |
| `00-problem-hypotheses/`  | Problem hypotheses            |
| `01-metrics/`             | Success metrics               |
| `02-solution-hypotheses/` | Solution hypotheses           |
| `03-features/`            | Feature specs                 |
| `04-tasks/`               | Implementation tasks          |
| `05-adrs/`                | Architecture Decision Records |

Each directory uses a zero-padded four-digit prefix so `ls` output is ordered by the
natural flow of product development (problem → metric → solution → feature → task → ADR).

## Decision

Introduce the artifact directory scaffold as an explicit, version-controlled structure
initialised by `pet init`. The scaffold must:

1. Create all six numbered directories under the configured artifact root.
2. Place a `README.md` in each directory explaining the artifact type, required
   frontmatter fields, and naming convention (`NNNN-<slug>.md`).
3. Be idempotent — running `pet init` on an existing repo must not overwrite existing
   files or directories.
4. Emit a `product/context/project.md` stub prompting the user to describe their project,
   tech stack, and team size (used by agent prompts downstream).

## Acceptance criteria

- `pet init` on a clean directory creates exactly the six artifact directories and their
  `README.md` files, plus `product/context/project.md`.
- `pet init` on a repo where `03-features/` already contains files leaves those files
  untouched and exits with code 0.
- Each generated `README.md` references the correct artifact type, lists required
  frontmatter fields, and gives a filename example.
- The scaffold passes the existing `scripts/validate.ts` structural checks without
  errors.
- Unit tests cover: clean init, idempotent re-init, partial pre-existing scaffold.

## Consequences

**Positive:**

- All contributors share a single mental model of where things live.
- Agents can navigate the artifact graph with deterministic paths rather than glob
  heuristics.
- Onboarding documentation ("where are the decisions?") collapses to one sentence.

**Negative / risks:**

- Teams that already have a `docs/` or `decisions/` layout must migrate existing files;
  migration is out of scope for this feature and must be handled manually or by a
  follow-on migration script.
- The numeric prefix ordering is opinionated; teams who want a flat layout cannot change
  it without forking the schema validation rules.
