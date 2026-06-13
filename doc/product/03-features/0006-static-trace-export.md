---
id: FEAT-0006
status: proposed
solution_hypothesis_id: SOL-0003
architectural_review_status: pending
---

# Static trace export

## Context

SOL-0003 explicitly identifies a risk: "`pet trace` adds a dependency on LLM
availability at query time; teams in air-gapped environments need a static fallback
(pre-generated trace documents)."

FEAT-0005 delivers the interactive, LLM-powered `pet trace` command. But two classes of
users cannot rely on it as their primary mechanism:

1. **Air-gapped teams** — security-sensitive organisations (finance, defence, regulated
   healthcare) where outbound LLM API calls are not permitted.
2. **CI / documentation pipelines** — teams who want trace narratives committed to the
   repo or published to an internal docs site on every merge, without depending on
   real-time LLM availability.

Static trace export pre-generates narratives for every indexed code path and writes them
as Markdown files alongside the artifact store. These files are committed to the repo,
readable without any tooling, and regenerated in CI whenever the artifact graph changes.
They are a cached snapshot of what `pet trace --no-llm` (plus a stored narrative) would
produce at generation time.

## Decision

Implement `pet trace --export <output-dir>` (or equivalently `pet export-traces`) that:

1. Iterates every entry in the code-to-artifact link index (FEAT-0004).
2. For each entry, runs the full trace graph walk (same logic as FEAT-0005) and
   generates the narrative using the LLM reconciler agent.
3. Writes one Markdown file per unique entry point to `<output-dir>`, using a
   filename derived from the source path
   (e.g. `src/cli/trace.ts` → `src__cli__trace.ts.md`).
4. Writes a `<output-dir>/index.md` that lists all exported traces with one-line
   summaries and links to the individual files.
5. Exits with code 0 if all entries were traced successfully; exits with code 1 if
   any entry failed (coverage gap, LLM error), printing a summary of failures.

**Suggested output directory:** `product/traces/` (committed to repo).

**Regeneration trigger (CI):** A GitHub Actions workflow step runs
`pet trace --export product/traces/` on every push to the default branch when any of
the following change: artifact files under `product/`, `product/context/code-links.json`,
or source files matched by an index entry.

**Out of scope for this feature:**

- Incremental export (only regenerating traces for changed paths). All entries are
  re-exported on each run for correctness. Incremental optimisation is a follow-on.
- Hosting or serving the exported Markdown as HTML. The files are plain Markdown;
  rendering is left to the team's existing docs tooling.
- Exporting traces for paths _not_ in the index. Coverage gaps must be fixed in the
  index, not worked around by the exporter.

## Acceptance criteria

- `pet trace --export product/traces/` generates one `.md` file per index entry and an
  `index.md` listing all traces; the command completes without error when the artifact
  store has ≥ 1 index entry.
- Each exported `.md` file contains a `Sources:` footer identical in format to the
  interactive `pet trace` output (FEAT-0005), listing all cited artifact IDs.
- Each artifact ID in every `Sources:` footer resolves to an existing artifact file
  (i.e. the same integrity check as FEAT-0005 applies to exported files).
- Re-running `pet trace --export product/traces/` on an unchanged artifact store
  produces byte-for-byte identical output files (deterministic generation, given the
  same LLM model and temperature = 0).
- When one index entry cannot be traced (e.g. a coverage gap), the command still
  exports all other entries successfully and exits with code 1, printing a list of
  failed entries.
- The GitHub Actions workflow step runs `pet trace --export product/traces/` only when
  relevant files change (artifact files, `code-links.json`, or matched source files),
  verified by the step's `paths` filter.
- A new team member with no `pet` CLI installed can open `product/traces/index.md` in
  any Markdown viewer and navigate to a trace for any indexed file without running any
  command.
- Unit / integration tests cover: successful export of 3-entry index produces 4 files
  (3 trace files + index), one failing entry exits code 1 and lists the failure,
  re-export is deterministic, output directory is created if it does not exist.

## Consequences

**Positive:**

- Air-gapped teams get the full onboarding benefit of SOL-0003 without real-time LLM
  access — the narrative is pre-generated and committed like any other documentation.
- Committed trace files are diffable: a PR that changes a feature description will show
  updated trace narratives in the diff, making the impact of documentation changes
  visible at review time.
- The export pipeline acts as a continuous integration smoke test: if the LLM produces
  a trace that references a non-existent artifact ID, the CI step fails and the broken
  reference is caught before merge.

**Negative / risks:**

- Pre-generated traces can become stale if the artifact store is updated without
  re-running the export. The CI trigger mitigates this for the default branch, but
  feature branches may have outdated traces until merged.
- Deterministic LLM output (temperature = 0) is a goal, not a guarantee. Some LLM
  providers introduce non-determinism at low temperature. If outputs are non-deterministic,
  the re-export will produce spurious diffs on every CI run. The acceptance criterion
  for determinism should be validated against the chosen provider before committing to
  this approach; a content-hash comparison (ignoring timestamp metadata) may be
  preferable to byte-for-byte equality.
- The `product/traces/` directory can grow large in repos with many indexed paths.
  Teams should be aware that committing auto-generated files increases repo size and
  `git log` noise. A `.gitattributes` entry marking `product/traces/` as
  `linguist-generated` is recommended.
