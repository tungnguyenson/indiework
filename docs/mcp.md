# Connecting an MCP client

IndieWork exposes its task/project surface to AI agents through a built-in **MCP
server** at `POST /mcp`. It's the same service layer the web UI and REST API use —
see [adr/0001-mcp-as-agent-surface.md](adr/0001-mcp-as-agent-surface.md) for why MCP
is the agent surface.

This page is the **how-to**: get the endpoint into a client and start calling tools.

## What you need

| | |
|---|---|
| **Endpoint** | `POST /mcp` — dev: `http://localhost:3000/mcp`, prod: `https://indiework.space/mcp` |
| **Transport** | JSON-RPC 2.0 over HTTP (stateless "streamable-HTTP"). POST only. |
| **Auth** | `Authorization: Bearer <API_TOKEN>` — the `API_TOKEN` from your `.env` |

The server does **not** auto-register itself in any client. You add it once, manually,
to whatever MCP client you use.

> The same `API_TOKEN` guards the REST API. Treat it like a password: keep it out of
> commits, rotate it if it leaks. There is no per-key scope yet — the token grants
> full access (managed `api_keys` with scopes are Phase 4 on the [roadmap](roadmap.md)).

## Client setup

### Claude Code

```bash
claude mcp add --transport http indiework http://localhost:3000/mcp \
  --header "Authorization: Bearer $API_TOKEN"
```

Swap the URL for `https://indiework.space/mcp` to point at production. Verify with
`claude mcp list`; the `indiework` tools then appear in any session.

### Claude Desktop / Cursor (JSON config)

```jsonc
{
  "mcpServers": {
    "indiework": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer <API_TOKEN>" }
    }
  }
}
```

### Anything else (n8n, custom agents)

Any MCP client that speaks streamable-HTTP works: point it at the endpoint and set
the `Authorization: Bearer <API_TOKEN>` header. Or call the JSON-RPC directly:

```bash
# list available tools
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# create a task in the Inbox
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "arguments":null,"params":{"name":"create_task","arguments":{"title":"Try the MCP server"}}}'
```

## Tools

28 tools, each a thin wrapper over a service method. Grouped by what they touch.

> **Write tools return a slim confirmation, not the full row.** `create_*` / `update_*` /
> `add_subtask` / `set_*` / `archive_*` echo back just the handle (`ref` / `id` / `key`) plus a
> label (`title`/`name`, `status`/`state`) — enough to confirm and address the write, without
> spending tokens on every column. Fetch the full record with `get_task` / `get_project` when
> you actually need it.

### Tasks

| Tool | Required args | Optional args | Notes |
|---|---|---|---|
| `create_task` | `title` | `project`, `module`, `milestone`, `status`, `priority`, `due_date` | Omit `project` → lands in the Inbox. |
| `create_tasks` | `tasks` | `project` | **Bulk create** in one call. `tasks` is an array of `create_task`-shaped items; `project` is the shared default KEY (omit → all Inbox). Returns one `{ ok, ref, id }` / `{ ok: false, error }` per item — one bad item doesn't abort the rest. |
| `add_subtask` | `parent_ref`, `title` | `status` | One level deep; inherits the parent's project/module/milestone. Gets its own ref (`KEY-<n>`), so it's patchable like any task. `status` defaults to `todo`. |
| `list_tasks` | — | `project`, `status`, `milestone`, `module` | Root tasks only; `status` is a single value. |
| `get_task` | `ref` | — | e.g. `SITE-3`. Returns the task plus its `children` (sub-tasks, each with its own ref + status) — use this to enumerate sub-tasks. |
| `update_task` | `ref`, `patch` | — | `patch` may set `title`, `status`, `priority`, `moduleId`, `milestoneId`, `dueDate`, `statusNote`, `description`. |
| `update_tasks` | `updates` | — | **Bulk patch** in one call. `updates` is an array of `{ ref, patch }` (same `patch` keys as `update_task`). Returns one `{ ok, ref }` / `{ ok: false, ref, error }` per item. |
| `add_comment` | `ref`, `body` | — | Appended to the timeline with source `agent`. |
| `list_comments` | `ref` | — | The task's comment timeline, oldest first. Each row has an `id` (use with `update_comment` / `delete_comment`), `body`, `source` (`web · api · mcp · agent`), `createdAt`, `editedAt` (null until first edit). |
| `update_comment` | `id`, `body` | — | Edits a comment in place **by its `id`** (from `list_comments` / `add_comment`). Keeps the original `source`, stamps an "edited" badge. |
| `delete_comment` | `id` | — | **Hard delete — cannot be undone.** Removes a comment **by its `id`** (from `list_comments`). |
| `set_status_note` | `ref`, `note` | — | Overwrites the pinned status note (what's blocking / where it is). |
| `delete_task` | `ref` | — | **Hard delete — cannot be undone.** |
| `list_inbox` | — | — | Untriaged Inbox tasks. |

### Projects

| Tool | Required args | Optional args | Notes |
|---|---|---|---|
| `list_projects` | — | — | All projects (with open-issue counts). |
| `get_project` | `project` | — | Project **with its milestones + modules embedded** — use it to discover milestone/module ids. |
| `create_project` | `key`, `name` | `emoji`, `color`, `status`, `pinned`, `tags`, `short_desc`, `status_note`, `description` | `key` = uppercase ref prefix (2–10 chars). |
| `update_project` | `project`, `patch` | — | `patch` may set `name`, `status`, `pinned`, `tags`, `emoji`, `color`, `shortDesc`, `statusNote`, `description`. |
| `archive_project` | `project` | — | **Soft-delete (reversible).** There is no hard project delete. |

### Milestones

| Tool | Required args | Optional args | Notes |
|---|---|---|---|
| `create_milestone` | `project`, `name` | `description`, `status`, `target_date`, `position` | `status` ∈ `planned · active · done`. |
| `update_milestone` | `id`, `patch` | — | `patch` may set `name`, `description`, `status`, `targetDate`, `position`. |
| `set_milestone_status` | `id`, `status` | — | `planned · active · done`. |
| `remove_milestone` | `id` | — | Hard delete; tasks keep working (milestone link cleared). |
| `reorder_milestones` | `ids` | — | Full ordered list of milestone ids. |

### Modules

| Tool | Required args | Optional args | Notes |
|---|---|---|---|
| `create_module` | `project`, `name` | `color`, `icon`, `state`, `description`, `position` | `state` ∈ `planned · active · done · archived`. |
| `update_module` | `id`, `patch` | — | `patch` may set `name`, `color`, `icon`, `state`, `description`, `position`. |
| `archive_module` | `id` | — | Soft-delete (reversible). |
| `reorder_modules` | `ids` | — | Full ordered list of module ids. |

### Argument conventions

- **`project`** is a project **KEY** (e.g. `SITE`), not an internal id.
- **`ref` / `parent_ref`** is the human ref (e.g. `SITE-3`), shown on every task row.
- **`id`** (on the milestone/module tools, and `module` / `milestone` on `create_task` /
  `list_tasks`) is the internal uuid — get it from **`get_project`**. On `update_comment` /
  `delete_comment` the `id` is a **comment** uuid — get it from **`list_comments`** (or the
  result of `add_comment`).
- **`patch`** objects use **camelCase** keys (e.g. `statusNote`, `dueDate`, `targetDate`),
  per each tool's row above.
- **`status`** is one of `inbox · backlog · todo · in_progress · in_review · pending ·
  done · cancelled`; **`priority`** is `none · low · medium · high · urgent`.
- **`due_date` / `target_date`** are ISO dates, e.g. `2026-07-15`.

## Caveats

- **Inbox tasks have no `ref` yet.** A task created without a `project` lands in the
  Inbox with `ref: null` / `seq: null` — a per-project ref (`KEY-<n>`) is only
  allocated when the task is **triaged into a project**. Until then the ref-based
  tools (`get_task`, `update_task`, `add_comment`, `list_comments`, `set_status_note`,
  `delete_task`) can't address it, and they reject the raw uuid too. To get an addressable task
  immediately, pass `project` on `create_task`; otherwise triage the Inbox task
  (web UI) first.
- **POST only.** `GET /mcp` returns `405` — the server is stateless and opens no
  server-initiated SSE stream. Clients that *require* an SSE/session handshake to
  connect may not work; plain tool calls over HTTP POST are fine.
- **401** means the Bearer token is missing or wrong.
- A tool that fails validation returns `isError: true` with the message in the result
  content (not a JSON-RPC error), so agents can read and recover.
