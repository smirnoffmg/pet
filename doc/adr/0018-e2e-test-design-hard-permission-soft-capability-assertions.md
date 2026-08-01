# 18. E2E test design: hard permission, soft capability assertions

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

The end-to-end suite runs the full nine-stage pipeline against a real local model. Such a
test cascades: if stage one produces empty output because the model was weak, stages two
through nine fail for reasons unrelated to anything under test, and the report is nine red
lines pointing nowhere.

ADR-0015 established that model capability and code correctness are different verdicts. The
test structure has to make that distinction visible rather than leaving it to whoever reads
the failure.

## Decision

**Assertions are classified by what they prove.**

_Permission-boundary assertions are hard._ Plain `expect`; they abort the run. A violated
path permission (ADR-0014) is a code defect and must stop everything.

_Model-capability assertions are soft._ `expect.soft`; they record and continue. "The agent
did not produce an artifact here" is information about the model.

**Plumbing runs before the capability assertion of its own stage,** so accepting an
artifact or marking a task done still happens even when the stage's output was judged
inadequate — later stages then get their chance instead of dying on missing input.

**The suite is invisible by default.** `describe.skipIf` on
`PET_LLM_PROVIDER === "ollama" && PET_LLM_MODEL`, plus a runtime reachability probe for the
daemon. `npm test` never runs it, so CI stays deterministic (ADR-0008).

## Consequences

Positive: a failed run is diagnosable at a glance — hard failures mean fix the code, soft
failures mean use a better model. One run exercises the whole pipeline instead of stopping
at the first weak stage.

Negative: the skip guard is the only thing keeping this suite out of the default `vitest`
include, so the suite is normally never executed and can rot unobserved.

**It had rotted, and the repair changed this decision.** The e2e files addressed unnumbered
artifact directories — `hypotheses/`, `features/`, `tasks/` — while their own fixture
helpers created the numbered layout ADR-0002 mandates, so the suite died on the first step
and had in fact never run. Repairing the paths exposed two things the original split did
not account for:

**A refused action is the system working, not a failure.** When a weak model invents a path
outside its allow-list, the permission layer denies the write — and deepagents surfaces that
denial as a thrown error that aborts the step. Counting the throw as a permission-boundary
failure reports the boundary as broken at the exact moment it did its job. The same holds
for a malformed tool call the harness rejects against a correct schema. Both are classified
in `tests/helpers/agent-error.ts` as model faults: recorded softly, never fatal. Any other
throw still propagates as a hard failure.

**Upstream preconditions must be soft too.** A step guarded by
`expect(featPath).toBeDefined()` fails hard when an earlier step's model produced nothing —
burying the one real signal under a cascade of eight identical errors. Those guards now
record softly and skip the step, so each step's permission assertions still run.

With these in place the suite reports the intended verdict: run against a 7B model, every
permission assertion passes and only capability assertions fail.
