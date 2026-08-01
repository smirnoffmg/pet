# 8. Verification strategy: mock determinism, idempotence, live dogfood

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

The core of this tool calls language models. Model output is non-deterministic, costs money,
and requires credentials, so it cannot be the thing CI asserts against. But a test suite
that never exercises the real path proves only that the mocks agree with themselves.

## Decision

Verification is split into three layers with different guarantees.

**§1 — Deterministic mocks are the default.** `PET_MOCK_AGENTS=1` swaps every subagent for
a filesystem-only stand-in (`src/agents/mock-runner.ts`) that writes plausible artifacts
with no network call. The full pipeline runs this way in CI and in the pre-commit hook.
Consequently no hook and no CI job ever makes an LLM call — a hook that could cost money or
hang on a network timeout is not a hook people keep installed.

**§2 — Reconcilers are idempotent, and it is asserted.** Running a command against
converged state must emit zero spawn commands and append zero lines to the orchestration
log, whatever the reason for being converged. `tests/integration/feat-0004-idempotency.test.ts`
asserts both halves. Idempotence is what makes a stateless reconciler (ADR-0011) safe to
re-run, so it is a tested property rather than an intention.

**§3 — The real path is verified by explicit opt-in.** `scripts/live-e2e.ts` runs the
pipeline against a real provider. It requires `ANTHROPIC_API_KEY`, refuses to start if
`PET_MOCK_AGENTS` is set, and asserts that new artifacts appeared and that `pet validate`
still passes afterwards. It is never part of `npm test`.

## Consequences

Positive: CI is free, fast, offline, and deterministic. The idempotence assertion catches
the most likely reconciler bug — accidentally introducing state — directly.

Negative: mock coverage can drift from real agent behaviour, and only the live run detects
it. Nothing schedules that run, so in practice it happens when someone remembers. Prompt
regressions are invisible to CI by construction: prompts are data, and the assertions are
about plumbing.

Accepted knowingly. The alternative — asserting on model output — produces a suite that
fails for reasons unrelated to the change under test, which is worse than a known gap.
