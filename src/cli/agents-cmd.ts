export const AGENTS_GUIDE = `# pet — instructions for AI coding agents

You are working in a repository whose product pipeline is managed by \`pet\`.
The pipeline artifacts live under \`doc/product/\` (markdown + YAML frontmatter)
and \`doc/adr/\` (plain Nygard-format ADRs). Treat these rules as binding.

## Orient yourself

    pet list          # pipeline tree: PROB -> SOL -> FEAT (and tasks, releases)
    pet next          # the next recommended action, in priority order
    pet validate      # schema + FK + immutability checks (fast, no LLM calls)

The FK chain reads: TASK / QA -> FEAT -> SOL -> MET -> PROB. Always reference
artifacts by ID (e.g. FEAT-0003), never by file path.

## Creating artifacts

Never write artifact files by hand. \`pet new <kind> "<title>"\` allocates the
ID, scaffolds frontmatter, and names the file:

    pet new hypothesis "Users need X"            # PROB-NNNN
    pet new task --feature FEAT-0001 "<title>"   # TASK-NNNN
    pet new release --features FEAT-0001 "v1.x"  # REL-NNNN
    pet new adr "<title>"                        # ADR-NNNN

If you ever must touch an artifact file directly, run \`pet validate\` before
committing.

## Immutability — the one rule you must not break

- \`status: accepted\` decision artifacts (PROB, MET, SOL, FEAT, REL, QA, ADR)
  are immutable. Never edit their body — not even typos.
- To change an accepted decision: create a new artifact with
  \`supersedes: <old-id>\`, then set only \`superseded_by\` and
  \`status: superseded\` on the old one.
- \`superseded\` and \`rejected\` artifacts are never edited at all.
- Only \`proposed\`/\`draft\` bodies are free to edit. Tasks are the exception:
  their \`status\` field is mutable state (todo -> in_progress -> review -> done).

## Human-in-the-loop gates

\`pet accept ...\` and \`pet reject ...\` promote decisions to immutable status.
These are decisions for the human, not for you: run them only when the human
explicitly asked, and never add \`--yes\` on your own initiative. If the
pipeline is blocked on an accept gate, stop and tell the human which command
to run.

## Commands that spawn LLM subagents (cost money)

    pet discover --hypothesis PROB-NNNN     # Researcher fills Evidence
    pet discover --solution-hypothesis ...  # FeatureDesigner drafts FEAT
    pet discover --feature FEAT-NNNN        # enrich a scaffold feature body
    pet deliver  --feature FEAT-NNNN        # Architect -> ADRs, TechLead -> tasks
    pet develop  --task TASK-NNNN           # Dev enriches the task body
    pet qa       --feature FEAT-NNNN        # QA plan
    pet release  --release REL-NNNN         # DevOps deployment checklist
    pet orchestrate                         # advance the pipeline by one step

Preview any of them with \`--dry-run\` first. These commands prompt for cost
confirmation; leave that prompt to the human unless told otherwise.

## Finishing work

When a task's implementation is merged, archive it with:

    pet task done TASK-NNNN

Do not move task files or flip their status by hand — the command stamps
\`completed_at\` and \`commit_sha\`, moves the file to \`04-tasks/archive/\`, and
validates the result.

## Never do

- Edit an accepted, superseded, or rejected artifact's body
- Delete an artifact (supersede instead)
- Hand-pick IDs or hand-roll artifact files
- Reference artifacts by path instead of ID
- Pass \`--yes\` to accept/reject/agent commands without explicit human approval
`;

export function runAgents(): number {
  console.log(AGENTS_GUIDE);
  return 0;
}
