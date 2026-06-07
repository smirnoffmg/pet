# Project Context

## Overview

`pet` (Product Engineering Toolkit) is a CLI tool that enables small teams or solo engineers to run an opinionated, agent-assisted product development cycle. It models all product work (hypotheses, features, tasks, metrics, releases, ADRs) as version-controlled markdown files with YAML frontmatter, and uses stateless LLM reconciler agents to drive discovery and delivery workflows. The primary users are engineers and small product teams who want to keep strategic context in their git repo rather than external tools.

## Tech Stack

- **Language:** TypeScript (strict mode), Node.js 20+
- **CLI framework:** Commander.js
- **UI layer:** Ink (React-based terminal UI) with `@inquirer/prompts`
- **Agent harness:** `deepagents` npm package
- **LLM integration:** LangChain (multi-provider: Anthropic default, OpenAI, Azure, Bedrock, Vertex, Ollama)
- **Schema validation:** Zod
- **Build tool:** esbuild (custom `esbuild.config.js`)
- **Test runner:** Vitest
- **Linting/formatting:** ESLint (v9 flat config), Prettier
- **Git hooks:** Husky
- **Runtime scripting:** tsx (for `scripts/validate.ts`)

## Project Structure

- **`src/`** — Main TypeScript source: CLI commands, agent definitions, LLM provider factory, artifact validators
- **`tests/`** — Vitest test suite, includes e2e tests (e.g., Ollama-targeted tests)
- **`scripts/`** — Utility scripts including `postinstall.js` and `validate.ts` for artifact validation
- **`dist/`** _(generated)_ — esbuild output; `pet.js` is the CLI entry point
- **`doc/product/`** _(runtime artifact store)_ — Markdown artifact directories (`00-problem-hypotheses/`, `01-metrics/`, `02-solution-hypotheses/`, etc.)

## Recent Activity

The repository currently has only a single commit (`initial`), indicating this is a freshly published or newly initialized project. No iterative development history is visible yet, so active development areas cannot be inferred from commit patterns. The codebase appears to have been committed in a relatively complete initial state based on the breadth of the declared dependencies and structure.

## Testing & CI

- **Test runner:** Vitest (`vitest run` for CI, `vitest` for watch mode)
- **E2E tests:** Separate e2e suite runnable against Ollama (`test:ollama` script targets `tests/e2e`)
- **CI:** GitHub Actions (configured in repository)
- **Artifact validation:** `scripts/validate.ts` enforces schema validity, FK integrity, immutability rules, and filename conventions — runnable standalone and intended for CI
- **Type checking:** `tsc --noEmit` available as `typecheck` script
- **Pre-commit hooks:** Husky configured for lint/format gates
- **Coverage:** No explicit coverage configuration observed in `vitest.config.ts` or `package.json`
