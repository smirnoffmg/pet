# 23. MCP servers are opt-in per repo and per role

Date: 2026-06-16

## Status

Accepted

## Context

Written retroactively on 2026-07-31; see ADR-0001.

MCP servers give agents tools — memory stores, search, arbitrary remote services. An MCP
server can execute code and reach the network, which is a far wider blast radius than the
filesystem permissions of ADR-0014 were designed to bound. Auto-connecting every declared
server for every role would silently undo that work: an agent allowed to write one directory
but handed an unrestricted shell tool is not restricted.

## Decision

**Two independent switches, both required.** A server is connected for a role only if the
repository declares it _and_ the code allow-lists it for that role.

_Repository declaration_ — `pet.mcp.json` at the repository root, a Zod discriminated union
on `transport`:

- `stdio` — local child process; requires `command`, optional `args[]` and `env{}`;
- `http` — Streamable HTTP, the recommended remote transport; requires a valid `url`,
  optional `headers{}`;
- `sse` — legacy remote, same shape, kept only for servers that have not migrated.

Headers are used literally, with no environment interpolation. The file is gitignored, so
real tokens can live in it — that is a deliberate trade of convenience against the risk of
a secret in the working tree, and it is why interpolation was not added: a half-secret
mechanism invites treating the file as safe to commit.

_Code allow-list_ — `ROLE_MCP_SERVERS` in `src/agents/path-permissions.ts` names servers per
role. A server absent from a role's array is never connected regardless of what the config
says. Roles with an empty list short-circuit before the config file is even read.

**Failure is degradation, not abort.** A malformed config yields zero tools plus a log line
rather than killing the run; an agent with fewer tools can still do useful work, whereas a
failed run cannot. `disconnect()` runs in a `finally`, so a throwing agent does not leak
child processes.

`pet validate` checks the schema, the per-transport required fields, URL validity, and
rejects duplicate names.

## Consequences

Positive: nothing connects by default. Widening an agent's reach requires two edits in two
places, one of which is code review. Transport support is declarative and validated
deterministically with no LLM involvement.

Negative: enabling a server for a new role is a code change, not configuration — friction
that is intentional but real. Literal headers mean `pet.mcp.json` holds plaintext secrets
and depends entirely on the gitignore entry staying put.

Degrading silently on config errors means a typo in a server name looks like "that tool
just is not available", which is confusing in exactly the way a loud failure would not be.
