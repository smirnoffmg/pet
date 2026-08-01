# 15. Local-model capability floor and verification protocol

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Ollama support exists so the pipeline can run without sending product decisions to a hosted
API. In practice small local models fail in a specific way: they execute a single tool call
correctly but do not chain `ls → read_file → write_file` autonomously. They answer in prose
about what they would write.

This makes a failing end-to-end run ambiguous. Nothing was written — is the permission
matrix wrong, or is the model too weak? Without a way to tell these apart, every local-model
failure becomes a code investigation.

## Decision

**Capability is a property of the model, stated as a list, not inferred from size.**
`KNOWN_CAPABLE_OLLAMA_MODELS` names models verified to chain tool calls under `deepagents`.
An unlisted model **warns and proceeds** — it is not blocked, because the list is knowledge
about what has been tried, not a licence.

The criterion is behavioural: _does it chain `ls → read_file → write_file` unaided?_ Not a
parameter count. Parameter count correlates poorly — the verified list includes a 12B model
and excludes larger ones.

**Ollama gets explicit tool-use guidance, and only Ollama.** When and only when the provider
is `ollama`, `run-agent.ts` injects a tool-use protocol and a per-role directory hint into
the user message. Hosted models do not need it and it degrades their output, so it is gated
on `requiresExplicitToolGuidance()` rather than applied everywhere.

**A capability failure is a verdict about the model, never about the code.** If the
permission assertions in an e2e run are green and the capability assertions are not, the
conclusion is "use a stronger model" (ADR-0018 encodes this in the test structure).

## Consequences

Positive: local runs are possible, and their failures are diagnosable. The allow-list is
honest documentation of what has actually been tried.

Negative: the list is maintained by hand and goes stale as models are released. Injecting
provider-specific text into the prompt is a leak of provider knowledge into the agent layer
that ADR-0013 otherwise avoids; it is confined to one gated branch, but it is a real
exception.

The three call-outs that used to contradict this ADR have been reconciled to it: the e2e
headers no longer state a "70B+" floor (size is not the criterion — the verified list spans
12B to 72B), and `test:ollama` defaults to a model on the verified list instead of pinning
one those same files describe as incapable.

Verified in practice on 2026-07-31 against `qwen2.5:7b`: the model does not chain tool
calls, and the suite says so precisely — every permission assertion green, only capability
assertions red. That is the protocol working, and it is the outcome to expect from any
7-8B model.
