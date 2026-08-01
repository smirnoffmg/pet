# 21. Delivery continuation: develop, QA, release

Date: 2026-06-14

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Discovery ends with an accepted feature and DeliveryLead stops once tasks exist. Everything
after that — implementation, QA planning, release — was outside the pipeline. The obvious
way to close the gap is a long-running process that tracks a feature from tasks to shipped,
but that is exactly the stateful orchestrator ADR-0011 rejects.

## Decision

Continue with the same stateless-reconciler pattern: one command per stage, each deciding
from artifact state alone.

    todo TASK-                                   → pet develop --task   → Dev enriches the body
    (human implements; task → done)                                       ADR-0022
    accepted FEAT- with done tasks, no QA plan   → pet qa --feature     → QA writes QA-NNNN
    proposed QA-                                 → pet accept qa-plan   → HITL gate
    proposed REL- without deployment checklist   → pet release          → DevOps enriches
    proposed REL-                                → pet accept release   → HITL gate
    accepted REL-                                → human sets shipped   → manual, deliberately

Each stage idles rather than erroring when its work is already done: a feature that already
has a QA plan returns idle, a release that already has a checklist returns idle. This is
what makes the whole chain re-runnable (ADR-0008 §2).

**`shipped` stays a manual flip.** No command sets it. Whether something actually reached
production is knowledge the repository does not have, and inferring it would be the tool
asserting something it cannot check.

**The Architect/TechLead transition belongs here, not to discovery.** An accepted feature
with a real body and no tasks spawns Architect (or TechLead once architectural review is
cleared) — that rule lives in `src/controllers/delivery-lead.ts`. It has been described in
project documentation as part of the discovery contract; it is not.

## Consequences

Positive: the pipeline is complete end to end without introducing a stateful component or
a scheduler. Every stage is independently testable and independently re-runnable.

Negative: the human is the scheduler. Nothing advances without someone running the next
command, and `pet next` exists because the state machine is otherwise hard to hold in your
head.

The `done`-task predicate means QA is only proposed after work is finished, so QA planning
cannot happen in parallel with implementation — a real limitation for teams that write test
plans up front.
