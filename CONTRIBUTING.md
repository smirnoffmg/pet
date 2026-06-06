# Contributing to PET

Thanks for your interest in contributing to the Product Engineer Toolkit.

## Development setup

```bash
git clone https://github.com/smirnoffmg/pet.git
cd pet
npm install          # builds dist/pet.js via postinstall
npm link             # puts `pet` on your PATH
```

Set your LLM provider key (Anthropic by default):

```bash
export ANTHROPIC_API_KEY=sk-...
```

## Running checks

```bash
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint + Prettier
npm run test         # Vitest unit + integration tests
npm run validate     # Zod + FK + immutability checks on doc/
```

All four must pass before a PR can merge. They also run in the pre-commit hook via Husky.

## Making changes

### Source code

- No `any` casts. Use `unknown` + Zod parse at system boundaries.
- Named exports only — no default exports.
- All LLM provider imports must stay inside `src/llm/provider-factory.ts`. ESLint enforces this.
- Error handling via `Result<T, E>` (neverthrow) or custom error classes with `name` set.

### Artifacts under doc/

This project dogfoods its own pipeline. When adding a feature to PET itself:

```bash
pet new hypothesis "Users need X"
pet discover --hypothesis PROB-NNNN
pet accept hypothesis PROB-NNNN
# ... continue through the pipeline
```

**Never hand-roll artifact files** — use `pet new` and run `pet validate` before committing.

Accepted decision artifacts (`doc/adr/`, `doc/product/03-features/`, etc.) are **immutable**. To change a decision, supersede the old artifact and create a new one.

### Architecture decisions

Any change to agent roles, controller contracts, artifact schemas, or cross-cutting concerns requires an ADR in `doc/adr/`. See existing ADRs for the format.

## Pull request guidelines

- Keep PRs focused — one logical change per PR.
- Add or update tests for any behaviour you change.
- Ensure `npm run test && npm run typecheck && npm run lint && npm run validate` all pass.
- Write a clear PR description explaining what changed and why.

## Project structure

```
src/
  agents/      — Agent implementations
  cli/         — CLI command definitions
  controllers/ — Stateless reconciler logic (Orchestrator, DeliveryLead, DiscoveryLead)
  llm/         — LLM provider factory (single import boundary)
  prompts/     — Agent system prompts (markdown)
  schemas/     — Zod schemas for all artifact types
  validators/  — FK integrity, immutability, filename validators
  store/       — Filesystem read/write helpers
  retrieval/   — Graph-based context retrieval
doc/
  adr/         — Architecture decision records
  product/     — Pipeline artifacts (hypotheses, features, tasks, releases, etc.)
tests/
  integration/ — Feature-level correctness tests
  helpers/     — Fixture builders for subagent tests
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
