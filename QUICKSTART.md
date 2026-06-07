# Quickstart

- [Quickstart](#quickstart)
  - [Prerequisites](#prerequisites)
  - [Install](#install)
  - [Configure](#configure)
    - [Choosing a provider](#choosing-a-provider)
    - [Mock mode (no API key needed)](#mock-mode-no-api-key-needed)
    - [Verbose output](#verbose-output)
    - [MCP tool servers (optional)](#mcp-tool-servers-optional)
  - [Starting on an existing project](#starting-on-an-existing-project)
  - [Starting on a new project](#starting-on-a-new-project)
    - [1. Create a target metric](#1-create-a-target-metric)
    - [2. Pose a problem hypothesis](#2-pose-a-problem-hypothesis)
    - [3. Run discovery (Researcher fills Evidence)](#3-run-discovery-researcher-fills-evidence)
    - [4. Design a solution](#4-design-a-solution)
    - [5. Design a feature](#5-design-a-feature)
    - [6. Deliver (Architect + TechLead)](#6-deliver-architect--techlead)
    - [7. Develop tasks](#7-develop-tasks)
    - [8. QA and release](#8-qa-and-release)
  - [Conversational interface](#conversational-interface)
  - [Useful commands](#useful-commands)
  - [Validate before committing](#validate-before-committing)
  - [Key rules to remember](#key-rules-to-remember)

Get from zero to a running pipeline in about 10 minutes.

## Prerequisites

- Node.js 20+
- An API key for your LLM provider (Anthropic by default)
- Git (the repo is the database)

## Install

```bash
git clone <this-repo>
cd pet
npm install          # builds dist/pet.js via postinstall
npm link             # puts `pet` on your PATH
```

Without `npm link`, prefix every command with `npx pet` or `npm run pet --`.

## Configure

### Choosing a provider

Set one environment variable. Everything else is optional.

| Provider       | Required env var(s)                                  | Notes                               |
| -------------- | ---------------------------------------------------- | ----------------------------------- |
| `anthropic`    | `ANTHROPIC_API_KEY`                                  | Default                             |
| `openai`       | `PET_LLM_PROVIDER=openai` + `OPENAI_API_KEY`         |                                     |
| `azure-openai` | `PET_LLM_PROVIDER=azure-openai` + `AZURE_OPENAI_*`   |                                     |
| `bedrock`      | `PET_LLM_PROVIDER=bedrock`                           | Uses AWS credential chain           |
| `vertex`       | `PET_LLM_PROVIDER=vertex`                            | Uses GCP application-default creds  |
| `ollama`       | `PET_LLM_PROVIDER=ollama` + `PET_LLM_MODEL=llama3.3` | Local; needs `ollama serve` running |

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export PET_LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-...

# Ollama (local, no API key)
export PET_LLM_PROVIDER=ollama
export PET_LLM_MODEL=llama3.3
# Optionally override default base URL:
export PET_LLM_BASE_URL=http://localhost:11434
```

Put these in your shell profile (`.zshrc`, `.bashrc`) or a `.env` file that you source before running `pet`.

### Mock mode (no API key needed)

For testing the CLI and validators without spending tokens:

```bash
export PET_MOCK_AGENTS=1
```

Agents run instantly and produce minimal stub output. Used by CI.

### Verbose output

```bash
export PET_VERBOSE=1        # persist in shell
pet deliver --feature FEAT-0001 -v   # or per-command flag
```

### MCP tool servers (optional)

Create `pet.mcp.json` at the repo root to attach external tool servers (e.g. a persistent memory graph):

```json
{
  "servers": [
    {
      "name": "memory",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  ]
}
```

The `memory` server is pre-wired for the `researcher` and `dev` roles. To customise where it stores data:

```json
{ "env": { "MEMORY_FILE_PATH": "/your/path/memory.jsonl" } }
```

Run `pet validate` after editing `pet.mcp.json` — it checks schema and duplicate names.

---

## Starting on an existing project

Your repo already has code and history. `pet init` reads it and writes a context summary that agents use as background on every invocation.

```bash
cd your-project
pet init
# Scans git history, README, and file structure
# → writes doc/product/context/project.md
```

Review the generated file and edit anything that's wrong or missing — agents will trust it. Then continue with the normal pipeline below, starting at step 1.

---

## Starting on a new project

This walks through a complete discovery → delivery cycle from scratch.

### 1. Create a target metric

Everything in pet is anchored to a measurable outcome.

```bash
pet new metric "Time to first validated artifact cycle"
# → MET-0001 created
```

Accept it (HITL gate):

```bash
pet accept metric MET-0001
```

### 2. Pose a problem hypothesis

The `--metric` flag links the hypothesis to MET-0001 at creation, satisfying the FK required for acceptance.

```bash
pet new hypothesis --metric MET-0001 "Teams lose strategic context during PM-to-Jira handoff"
# → PROB-0001 created with target_metric_ids: [MET-0001]
```

### 3. Run discovery (Researcher fills Evidence)

```bash
pet discover --hypothesis PROB-0001 --dry-run   # see what will happen
pet discover --hypothesis PROB-0001 --yes        # run it
```

Review the Evidence section in `doc/product/00-problem-hypotheses/0001-*.md`, then accept:

```bash
pet accept hypothesis PROB-0001
```

### 4. Design a solution

Same command as step 3 — but now PROB-0001 is `accepted`, so DiscoveryLead spawns SolutionDesigner instead of Researcher.

```bash
pet discover --hypothesis PROB-0001 --yes
# SolutionDesigner runs → SOL-0001 created

pet accept solution-hypothesis SOL-0001
```

### 5. Design a feature

```bash
pet discover --solution-hypothesis SOL-0001 --yes
# FeatureDesigner runs → FEAT-0001 created

pet accept feature FEAT-0001
```

### 6. Deliver (Architect + TechLead)

```bash
pet deliver --feature FEAT-0001 --dry-run
pet deliver --feature FEAT-0001 --yes
# Architect reviews architecture → ADR written (or skipped)
# TechLead decomposes feature → TASK-NNNN files created
```

### 7. Develop tasks

```bash
pet list tasks                     # see what was created
pet develop --task TASK-0001 --yes # Dev agent enriches task body
# Implement the task yourself, then set status: done in frontmatter
```

### 8. QA and release

```bash
pet qa --feature FEAT-0001 --yes
pet accept qa-plan QA-0001

pet new release --features FEAT-0001 "v0.1.0"
pet release --release REL-0001 --yes
pet accept release REL-0001
# Manually set status: shipped when deployed
```

---

## Conversational interface

Instead of running individual commands, you can use the Orchestrator dialogue:

```bash
pet          # bare command — opens a multi-turn session
pet chat     # explicit alias
```

The Orchestrator reads your current pipeline state and lets you:

- Ask "what should I work on next?"
- Trigger the next discovery or delivery step
- Accept artifacts — all without leaving the session

Exit with `Ctrl-C` or type `.exit`.

---

## Useful commands

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `pet list`                  | Pipeline tree: HYP → SOL → FEAT                          |
| `pet list tasks`            | All open dev tasks                                       |
| `pet next`                  | Show the recommended next action                         |
| `pet orchestrate --dry-run` | Preview what `orchestrate` would do                      |
| `pet orchestrate --yes`     | Advance the pipeline one step                            |
| `pet repl`                  | Interactive loop: show next action, confirm, run, repeat |
| `pet validate`              | Validate all artifacts (also runs on pre-commit)         |
| `pet logs`                  | Orchestration audit log + latest session log             |
| `pet clean`                 | Remove local session data under `~/.local/share/pet/`    |

---

## Validate before committing

The pre-commit hook runs `pet validate` automatically. To run it manually:

```bash
pet validate
# or
npm run validate
```

Validation checks: Zod schema validity, foreign key integrity, immutability of accepted artifacts, filename format. It is deterministic and fast — no LLM calls.

---

## Key rules to remember

- **Accepted artifacts are immutable.** To change a hypothesis or feature, create a new one with `supersedes: <old-id>` and flip the old one to `status: superseded`.
- **Never hand-roll artifact files.** Use `pet new` — it allocates IDs, writes frontmatter, and gets filenames right.
- **Foreign keys are by ID, not path.** `FEAT-0001`, not `doc/product/features/0001-...md`.
- **All LLM calls are explicit.** Agents run only when you invoke `pet deliver`, `pet discover`, etc. Nothing runs in the background.

See `CLAUDE.md` for the full constraint list and `doc/adr/` for architectural decisions.
