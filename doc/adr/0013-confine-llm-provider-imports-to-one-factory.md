# 13. Confine LLM provider imports to one factory

Date: 2026-06-06

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

Six providers are supported: Anthropic, OpenAI, Azure OpenAI, Bedrock, Vertex, Ollama. If
call sites imported provider packages directly, every agent would couple to a vendor SDK,
swapping providers would become a repository-wide edit, and provider-specific behaviour
would leak into controllers that have no business knowing which model is behind them.

Conventions of this kind decay unless something mechanical stops the first violation.

## Decision

**`src/llm/provider-factory.ts` is the only module in `src/` permitted to import a provider
package** — `@langchain/anthropic`, `@langchain/openai`, `@langchain/aws`,
`@langchain/community`, `@langchain/google-vertexai`, `@langchain/ollama`.

Everything else depends on the abstract `BaseChatModel` and obtains one from
`createModel()`. Provider and model are selected purely by environment:
`PET_LLM_PROVIDER` (default `anthropic`) and `PET_LLM_MODEL`.

**§Import constraint — enforced twice, independently:**

1. an ESLint `no-restricted-imports` rule scoped to `src/**/*.ts`, with a single-file
   exemption for the factory;
2. a grep in CI that does not depend on ESLint config being loaded, so disabling the rule
   does not silently disable the check.

Two mechanisms because one is a lint rule someone can turn off in the same commit that
violates it.

## Consequences

Positive: changing provider is an environment variable. The blast radius of a vendor SDK
breaking change is one file. Tests can run agent code with no provider installed.

Negative: provider-specific capabilities are unreachable unless surfaced through the
factory, which makes the factory a bottleneck by design — anything a provider does that
`BaseChatModel` does not express has to be added there deliberately (ADR-0015 is one such
addition). The duplicated enforcement means adding a provider requires updating the ESLint
allow-list and the CI grep together, and forgetting either weakens the guarantee silently.
