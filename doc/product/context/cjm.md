# Customer Journey Map — using `pet`

> This file is hand-authored and human-owned. Unlike `project.md` in this same
> directory (written by `pet init`), nothing regenerates or overwrites this
> file automatically — keep it current by hand as the CLI evolves. It exists
> to give both humans and agents a single authoritative statement of how
> `pet` is _meant_ to be used, as opposed to how any one doc or code path
> happens to describe it today.

## Persona

A solo engineer or small product team building a codebase in git, who wants
strategic product context (problems, solutions, features, decisions) to live
next to the code instead of in an external PM tool, and is willing to let LLM
agents draft that context under human approval gates.

## Entry points

`pet` has four doors in. Which one is right depends on what the user already
knows about the pipeline state.

| Entry point        | Command                                                                              | Implementation                                                        | When it's the right door                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree UI            | `pet` (bare, no subcommand)                                                          | `runTree()` → `TreeUI` (`src/cli/tree-cmd.ts`, `src/cli/tree-ui.tsx`) | Default daily driver once a pipeline exists. Browse the artifact tree, expand an artifact to see its contextual next actions, mark tasks done, watch auto-chains fire, check the audit log. |
| Orchestrator chat  | `pet chat`                                                                           | `runChatSession()` (`src/chat/session.ts`)                            | Conversational use: "what should I work on next," ad-hoc artifact creation/acceptance, without memorizing flags.                                                                            |
| Guided REPL        | `pet repl`                                                                           | `runRepl()` → `ReplUI` (`src/cli/repl-cmd.ts`)                        | A linear, one-step-at-a-time confirm loop — show the next recommended action, confirm, run, repeat. Good for a first end-to-end walkthrough.                                                |
| Direct subcommands | `pet new`, `pet discover`, `pet deliver`, `pet accept <kind>`, `pet task done`, etc. | `src/cli/main.ts`                                                     | Scripted, CI, or non-interactive use, or when the user already knows exactly which step to run next.                                                                                        |

`pet chat` and bare `pet` are **not the same thing** — bare `pet` never invokes
an LLM by itself; it only launches the Tree UI, which then shells out to the
same subcommands as direct CLI use when you trigger an action from it.

## Stage-by-stage journey

### 0. Install & configure

```bash
git clone <repo> && cd <repo>
npm install && npm run build && npm link   # or: npx pet / npm run pet --
export ANTHROPIC_API_KEY=sk-ant-...        # or PET_LLM_PROVIDER=openai|azure-openai|bedrock|vertex|ollama
```

`PET_MOCK_AGENTS=1` bypasses real LLM calls for testing the CLI/validators.
No gate — this stage just needs to succeed once.

### 1. Onboard

Two paths, depending on whether the target repo already has code:

- **Existing project**: `pet init` scans git history/README/file structure
  and writes `doc/product/context/project.md`. Review and correct it — every
  agent invocation trusts it as background.
- **New project**: skip straight to stage 2; there's no existing context to
  summarize.

Exit condition: `doc/product/context/project.md` exists and is accurate (existing
project), or the user is ready to create the first metric (new project).

### 2. Discovery cycle

Anchors work to a measurable outcome, then a falsifiable problem, then an
evidenced solution, then a scoped feature. Each promotion is a human gate.

The problem hypothesis comes first. `MET-` carries `problem_hypothesis_id`, so
`pet new metric` refuses to run until a `PROB-` exists to hang the metric on.

```bash
pet new hypothesis "..."                      # -> PROB-NNNN (the FK root)
pet new metric --hypothesis PROB-NNNN "..."   # -> MET-NNNN
pet accept metric MET-NNNN                    # gate

pet discover --hypothesis PROB-NNNN --yes     # Researcher fills Evidence
pet accept hypothesis PROB-NNNN               # gate

pet discover --hypothesis PROB-NNNN --yes     # now PROB is accepted -> SolutionDesigner drafts SOL-NNNN
pet accept solution-hypothesis SOL-NNNN       # gate

pet discover --solution-hypothesis SOL-NNNN --yes   # FeatureDesigner drafts FEAT-NNNN
pet accept feature FEAT-NNNN                  # gate
```

Less-obvious branch: if a `FEAT-` was created as a bare scaffold (no real
body yet), running `pet discover --feature FEAT-NNNN --yes` on an _accepted_
feature spawns DesignerEnrich to fill in the body — this is a repair path,
not part of the straight-line flow above.

Exit condition: at least one `FEAT-` is `accepted`.

### 3. Delivery cycle

`pet deliver` is a reconciler and advances one step per invocation: the first
run clears architectural review, and only the second decomposes into tasks.

```bash
pet deliver --feature FEAT-NNNN --yes
# 1st run: Architect reviews architecture, writes ADR(s) if warranted,
#          and sets architectural_review_status: cleared
pet deliver --feature FEAT-NNNN --yes
# 2nd run: TechLead decomposes the feature into TASK-NNNN files

pet list tasks
pet develop --task TASK-NNNN --yes            # Dev enriches task body with an implementation approach

# --- human implements the task in code ---

pet task done TASK-NNNN                       # preferred: archives the task, stamps
                                               # completed_at/commit_sha, validates FKs
# equivalently, from the Tree UI: focus the task row, press `d`
```

No HITL gate on tasks themselves (`DevTask.status` is always mutable), but
implementation happens outside `pet` — the human writes and merges the code.

**Auto-chain (Tree UI only)**: `nextAutoCommand` (`src/cli/tree-ui.tsx`) only
fires for commands dispatched _from within the Tree UI_ itself. Marking the
_last_ pending task of an accepted feature done by pressing `d` in the Tree
UI automatically chains into `pet qa --feature FEAT-NNNN`; the same wrapper
auto-chains an `accept` action triggered from the Tree UI into the next
unblocked discovery/delivery step. Running `pet task done` or
`pet accept ...` directly from a shell does **not** auto-chain — those are
one-shot invocations with no follow-up. This is the main practical reason to
prefer the Tree UI over raw subcommands once a pipeline is underway.

Exit condition: all of a feature's tasks are `done`.

### 4. QA & release cycle

```bash
pet qa --feature FEAT-NNNN --yes              # -> QA-NNNN (may be auto-chained from stage 3)
pet accept qa-plan QA-NNNN                    # gate

pet new release --features FEAT-NNNN "v0.1.0"   # -> REL-NNNN
pet release --release REL-NNNN --yes          # DevOps adds a deployment checklist
pet accept release REL-NNNN                   # gate

# after actual deployment, by hand:
#   set status: shipped in the REL- frontmatter
```

Exit condition: `REL-` is `accepted`, and later `shipped` once deployed.

### 5. Steady state

Once a pipeline exists, the journey stops being linear. The default loop is:

```bash
pet            # Tree UI: see the whole pipeline, drill into any artifact for
               # its next valid action, mark tasks done, watch auto-chains fire
```

`pet orchestrate --dry-run` / `--yes` and `pet repl` are the non-Tree-UI ways
to ask "what's the single next reconciler step" and run it. `pet next` answers
the same question without running anything. `pet chat` remains available any
time the user wants to ask in natural language instead of reading the tree.

## Non-negotiables that shape the journey (do not contradict these when auditing docs)

- Every promotion past a HITL gate (`hypothesis`, `qa-plan`, `release`, plus
  `feature`, `metric`, `solution-hypothesis`, `adr` acceptance) requires an
  explicit `pet accept <kind> <id>` — no agent, auto-chain, or UI action
  promotes its own output past a gate.
- `pet validate` is deterministic, fast, and makes no LLM calls — it's safe
  in a pre-commit hook and should be run before any commit that touches
  `doc/product/`.
- Accepted artifacts (outside `04-tasks/`) are immutable; the journey never
  includes "edit an accepted artifact" as a step — only supersession.
