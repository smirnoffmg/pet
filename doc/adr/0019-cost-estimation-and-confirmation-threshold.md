# 19. Cost estimation and confirmation threshold

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

A single `pet deliver` can chain several agent runs. Without a warning the first indication
of cost is the provider's bill, which is a bad way to learn that a command was more
expensive than expected. The tool should show the estimate before spending, not the total
after.

## Decision

**Estimate before running, confirm above a threshold.** Each spawn kind carries a coarse
USD estimate (`src/agents/cost.ts`); the planned total is compared against
`PET_COST_CONFIRM_THRESHOLD` (default `$0.50`) and prompts with `default: false` above it.
Wired identically into `deliver`, `discover`, `develop`, `qa`, `release`, and `orchestrate`.

**The estimate is deliberately coarse.** It is a hardcoded per-kind guess, not a token
model. Its job is to distinguish "this is a cent" from "this is several dollars" so the
user can decide whether to look closer. Calibrating it per role would imply a precision it
cannot have — the actual cost depends on artifact sizes and model behaviour that are not
known before the run.

**`--yes` skips the cost prompt only.** It does not skip HITL accept gates (ADR-0010).
Cost is a budget question; acceptance is a judgement question, and one flag must not answer
both.

**Actual usage is reported after the fact**, per run and per session, from real token
counts — that is where accurate numbers come from.

## Consequences

Positive: no command silently spends real money. The threshold is configurable, so users
with different tolerances are not arguing with a constant.

Negative: the estimates are guesses and will be wrong in both directions; users who learn
they are wrong will start ignoring the prompt, which is the failure mode of any inaccurate
warning.

**Known defects, recorded rather than hidden:** the cost table keys an entry
`spawn_designer`, which is not a member of the spawn-kind union — the real kinds are
`spawn_feature_designer` and `spawn_designer_enrich` — so that entry never matches. Four
further kinds (`spawn_dev`, `spawn_qa`, `spawn_devops`, `spawn_feature_designer`) have no
entry and fall through to the `0.1` default. The estimate is therefore even coarser than
intended, which does not change the decision but does mean the table should not be read as
a considered per-role calibration.
