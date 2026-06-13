---
id: FEAT-0005
status: proposed
solution_hypothesis_id: SOL-0003
architectural_review_status: pending
---

# `pet trace` CLI command

## Context

SOL-0003's core bet is that a new team member can run a single command against any file
or function and receive a concise, accurate narrative that explains the full chain of
reasoning — from a line of code back to the problem hypothesis that motivated it —
without reading every artifact or asking a senior engineer.

FEAT-0004 establishes the code-to-artifact link index that gives the trace agent its
entry point. This feature is the user-facing surface of SOL-0003: the `pet trace`
command that accepts a code location, walks the artifact graph via an LLM reconciler
agent, and emits a human-readable narrative with cited artifact IDs.

The success criteria in SOL-0003 are directly tested by this command:

- Senior engineers must rate the narrative ≥ 4/5 for accuracy on ≥ 80 % of sampled
  paths.
- ≥ 60 % of onboarding clarification questions must be answerable without synchronous
  senior input.

Those outcomes are only achievable if the command is fast to invoke, honest about gaps
in coverage, and cites sources so the reader can verify every claim.

## Decision

Implement `pet trace <target>` as a first-class CLI subcommand. `<target>` accepts:

- A **file path** relative to the repo root (e.g. `src/cli/validate.ts`)
- A **file path with symbol** using a `#` separator
  (e.g. `src/cli/validate.ts#runValidation`)
- A **PR number** prefixed with `pr:` (e.g. `pr:142`) — resolves changed files and
  selects the most artifact-dense entry point

**Execution flow:**

1. Look up `<target>` in the code-to-artifact link index (FEAT-0004). If no entry is
   found, emit a `[coverage gap]` notice and attempt a fuzzy full-text search across
   artifact bodies as a fallback; if still unresolved, exit with a human-readable
   explanation and exit code 2.
2. Starting from the resolved artifact IDs, the LLM reconciler agent walks the graph
   upward: FEAT → SOL → PROB, collecting the title and one-sentence summary of each
   hop.
3. The agent also walks sideways to related ADRs linked from any artifact in the chain.
4. The agent emits a narrative structured as:

   ```
   ## Why does <target> exist?

   `<target>` implements **<FEAT-NNNN: feature title>**.

   That feature was designed to validate **<SOL-NNNN: solution title>**, which
   hypothesises that <one-sentence solution summary>.

   The solution addresses **<PROB-NNNN: problem title>**: <one-sentence problem
   summary>.

   Related architectural decisions: <ADR-NNNN: title>, ...

   ---
   Sources: FEAT-NNNN, SOL-NNNN, PROB-NNNN[, ADR-NNNN, ...]
   ```

5. The `Sources:` footer lists every artifact ID cited in the narrative, so the reader
   can run `pet show <ID>` to read the full artifact.

**Flags:**

- `--format [narrative|json]` — default `narrative`; `json` emits a machine-readable
  object with `target`, `chain` (ordered list of artifact IDs and titles), and
  `narrative` fields.
- `--depth <n>` — limit graph traversal to `n` hops (default: unlimited up to PROB).
- `--no-llm` — skip the narrative; print only the raw artifact chain. Useful for
  scripting and air-gapped environments (see also FEAT-0006).

**Out of scope for this feature:**

- Interactive TUI or browser-based visualization of the graph.
- Automatic inference of code-to-artifact links (links must be declared in the index).
- Writing or updating artifacts based on trace output.
- Tracing from artifact IDs downward to code (inverse direction).

## Acceptance criteria

- `pet trace src/cli/trace.ts` resolves the entry point from the link index (FEAT-0004)
  and emits a narrative containing at least one artifact ID from each level present in
  the chain (FEAT, SOL, PROB).
- The narrative includes a `Sources:` footer listing every artifact ID cited in the
  body; every ID in the footer resolves to an existing artifact file.
- When `<target>` has no entry in the link index and no fuzzy match is found, the
  command exits with code 2 and prints a message of the form:
  `No artifact links found for "<target>". Run 'pet capture' to add one.`
- `pet trace src/cli/trace.ts --format json` emits valid JSON matching the schema
  `{ target: string, chain: Array<{ id: string, title: string, type: string }>, narrative: string }`.
- `pet trace src/cli/trace.ts --no-llm` prints the artifact chain without making an
  LLM API call; the output lists artifact IDs and titles only, one per line.
- `pet trace pr:142` resolves the changed files in PR 142, selects the file with the
  most index entries, and traces from that file.
- Total wall-clock time from invocation to first output token is under 3 seconds on a
  standard broadband connection (LLM streaming assumed).
- In a trace quality test with 5 senior engineers rating 10 known code paths, the
  narrative scores ≥ 4/5 for accuracy on ≥ 8 of 10 paths (matching SOL-0003 success
  criterion).
- Unit / integration tests cover: index hit produces correct chain, index miss exits
  with code 2, `--no-llm` produces no API call, `--format json` output validates
  against schema, ADR sideways links appear in output when present.

## Consequences

**Positive:**

- New team members get a self-service entry point to strategic context with a single
  command; no knowledge of the ID scheme or directory layout is required.
- The `Sources:` footer makes LLM-generated content verifiable, reducing the risk of
  hallucinated claims being accepted uncritically.
- `--no-llm` and `--format json` make the command composable with CI scripts and
  editor plugins.

**Negative / risks:**

- The command depends on LLM availability at runtime. Network outages or API quota
  exhaustion silently degrade the experience; `--no-llm` is the manual fallback, but
  it requires the user to know the flag exists. Consider a clear error message
  suggesting `--no-llm` when the LLM call fails.
- Narrative quality is bounded by artifact quality. If upstream artifacts are vague
  (e.g. a feature with one-line acceptance criteria), the trace narrative will be
  vague too. This is a known dependency on SOL-0001 and SOL-0002 being enforced
  upstream.
- PR-based tracing (`pr:`) requires read access to the VCS API. Teams using
  self-hosted VCS must configure an adapter; this is a follow-on concern and the
  initial implementation may restrict `pr:` to GitHub.
- Streaming output requires the CLI to handle partial responses gracefully; a dropped
  connection mid-stream should print what was received and exit with a non-zero code
  rather than silently truncate.
