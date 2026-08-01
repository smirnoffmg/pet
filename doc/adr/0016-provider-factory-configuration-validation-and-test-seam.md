# 16. Provider factory configuration validation and test seam

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

ADR-0013 made the factory the single chokepoint for provider construction. That creates two
follow-on problems it must also solve.

First, misconfiguration. A missing API key or a typo in `PET_LLM_PROVIDER` would otherwise
surface deep inside a vendor SDK, as a stack trace about an HTTP header, several frames
below anything the user wrote.

Second, testability. If every path to a model runs through the factory, and the factory
requires credentials, then no test can exercise agent code without them.

## Decision

**§1 — Validate at the boundary and fail with a named error.** `createModel()` checks the
provider name and the per-provider required environment before constructing anything, and
throws `ProviderConfigError` (`src/errors/`), which callers such as `pet chat` catch and
render as a user-facing hint rather than a trace. Ollama additionally probes `/api/tags`
first, so "the daemon is not running" is reported as that rather than as a connection
error mid-generation.

**§2 — One test seam, checked first.** A module-level `_setModelForTesting()` override
short-circuits `createModel()` before any validation. Tests inject a stub model instead of
mocking a vendor SDK's module shape, which keeps tests independent of SDK internals.

**§3 — The import ban is scoped to `src/**`only.** Test files may import provider packages
directly; integration tests legitimately need the real client. This exemption is itself
asserted in`tests/lint/provider-import-boundary.test.ts`, so it cannot be quietly widened
to production code.

## Consequences

Positive: configuration errors are legible and arrive before any token is spent. Agent code
is testable with no credentials and no network. The boundary rule of ADR-0013 has an
explicit, tested exception rather than an informal one.

Negative: `_setModelForTesting` is module-level mutable state in a codebase that otherwise
forbids it, and a test that sets it without resetting leaks the stub into every later test
in the same process. It is checked before validation by design, which also means it bypasses
every safety check in the factory — acceptable only because nothing in `src/` calls it.

Per-provider validation duplicates knowledge the SDKs also have, so a provider changing its
required environment means updating this file too.
