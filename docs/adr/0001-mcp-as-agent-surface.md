# 0001 — MCP as the agent surface for task & project management

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** Tung Nguyen

## Context

IndieWork needs to let an AI agent (e.g. Claude / Claude Code, acting on the
owner's behalf) **manage tasks and projects**: view/edit/delete tasks, and
create/edit/delete projects including their milestones and modules.

The architecture is already **"three frontends, one service layer"**
([scope.md §1](../scope.md)): Web UI (Server Actions), REST `/api/v1`, and MCP
`/mcp` are all thin adapters over `src/server/services/*`. REST and MCP reach the
**same** business logic, so the choice is *not* about capability — both can do
everything.

The service layer **already implements the full surface this feature needs**:

| Entity    | Service methods that already exist                                                        |
|-----------|------------------------------------------------------------------------------------------|
| projects  | `create` · `update` · `setStatusNote` · `archive` · `list`/`getByKey`/`getById`           |
| milestones| `create` · `update` · `setStatus` · `remove` · `reorder` · `list`                         |
| modules   | `create` · `update` · `archive` · `reorder` · `list`                                      |
| tasks     | `create` · `update` · `delete` · `toggleDone` · `assignToProject` · `setStatusNote` · `reorder` · `list` · `getByRef` |

So the feature is **not "build a capability"** — it is **"register the missing
adapters."** Before this change the MCP server
([src/app/mcp/route.ts](../../src/app/mcp/route.ts)) exposed 9 read/write task tools
and was missing: project create/update/archive, task delete, and all
milestone/module management.

Two real questions remained:

1. **Which surface should the agent use — REST or MCP?**
2. **How do we bound risk?** The owner's stated worry: deleting a project by accident.

## Decision

1. **MCP is the primary surface for the agent.** MCP is purpose-built for LLM
   tool-calling: self-describing via `tools/list` (the model reads tool names +
   descriptions + JSON schemas and *discovers* what it can do), auto-wired into
   MCP clients once at connection time, with a standardized result envelope — and
   it already records `source = agent` on the timeline. REST, by contrast,
   requires the caller to know the API out-of-band (routes, request shapes, auth);
   that is fine for deterministic clients but higher-friction for an autonomous LLM.

2. **REST stays, but is not extended for the agent's sake.** REST remains the
   surface for non-agent programmatic clients (scripts, cron, webhooks, other
   apps). Because every surface is a thin adapter over one service layer, adding
   REST parity later is cheap and non-blocking — **no lock-in**.

3. **"Scope" = the set of MCP tools registered.** For a single-user, self-hosted
   tool, **no permission engine / per-resource authorization matrix is built**
   (YAGNI). The capability boundary *is* the tool roster the MCP server exposes.

4. **Project "delete" maps to `archive` (soft), not hard delete.** `projectService`
   has only `archive` (sets `archived_at`), which matches the schema. The agent
   gets a reversible `archive_project`; **no hard project-delete tool is exposed.**
   Task `delete` is a real delete and is acceptable (lower blast radius); it can be
   softened later if desired.

## Tool roster (the contract)

> **Status: implemented 2026-06-15.** All tools below are registered — 23 total
> (9 original + 14 added). Per-tool args: [mcp.md](../mcp.md).

**Existing — keep:** `create_task` · `add_subtask` · `list_tasks` · `get_task` ·
`update_task` · `add_comment` · `set_status_note` · `list_projects` · `list_inbox`.

**Added:**

- **Read:** `get_project` — returns a project with its milestones **and** modules
  embedded. Added beyond the original ask because the milestone/module write tools
  address rows by uuid, and `list_projects` does not surface those ids; `get_project`
  is how the agent discovers them.
- **Tasks:** `delete_task`
- **Projects:** `create_project` · `update_project` · `archive_project`
- **Milestones:** `create_milestone` · `update_milestone` · `set_milestone_status` · `remove_milestone` · `reorder_milestones`
- **Modules:** `create_module` · `update_module` · `archive_module` · `reorder_modules`

Each new tool is a **thin wrapper over the matching service method**, mirroring the
existing tools in [src/app/mcp/route.ts](../../src/app/mcp/route.ts).

## Authorization reality (today vs. later)

`requireBearer` ([src/server/auth/token.ts](../../src/server/auth/token.ts))
validates the static `.ENV` `API_TOKEN` and **ignores scope entirely** — the token
currently grants full access. Managed `api_keys` with `read·write·read-write`
scope is **Phase 4** ([roadmap.md](../roadmap.md)). Therefore, until P4, the only
risk lever is **which tools are registered** (decisions 3 & 4), not auth-layer
enforcement. When managed keys land, destructive tools can be gated behind
`write`/`read-write`.

## Consequences

**Positive**

- Agent integration is plug-and-play — configure the MCP server once, tools appear.
- No new auth/permission code for this feature; risk is controlled by the tool roster.
- One service layer keeps all three surfaces consistent; REST parity stays an option, not a commitment.

**Trade-offs**

- No fine-grained per-key permissions yet; an over-trusted token has broad write
  access. Mitigated by not exposing hard-destructive project ops, and by the P4
  `api_keys` plan.
- Risk control via "don't register the tool" is coarse: re-enabling a destructive
  op is a code change, not a config toggle.

## References

- [scope.md](../scope.md) §1 (three frontends, one service layer), §4 (external access)
- [roadmap.md](../roadmap.md) — Phase 3 (MCP), Phase 4 (managed `api_keys`)
- [src/app/mcp/route.ts](../../src/app/mcp/route.ts) — 23 registered tools
- [mcp.md](../mcp.md) — connecting an MCP client (config snippets + tool reference)
- `src/server/services/*` — capabilities already implemented
- [src/server/auth/token.ts](../../src/server/auth/token.ts) — token auth; scope not yet enforced
