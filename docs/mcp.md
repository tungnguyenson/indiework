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

23 tools, each a thin wrapper over a service method. Grouped by what they touch.

### Tasks

| Tool | Required args | Optional args | Notes |
|---|---|---|---|
| `create_task` | `title` | `project`, `module`, `milestone`, `status`, `priority`, `due_date` | Omit `project` → lands in the Inbox. |
| `add_subtask` | `parent_ref`, `title` | — | One level deep; inherits the parent's project/module/milestone. |
| `list_tasks` | — | `project`, `status`, `milestone`, `module` | Root tasks only; `status` is a single value. |
| `get_task` | `ref` | — | e.g. `SITE-3`. |
| `update_task` | `ref`, `patch` | — | `patch` may set `title`, `status`, `priority`, `moduleId`, `milestoneId`, `dueDate`, `statusNote`, `description`. |
| `add_comment` | `ref`, `body` | — | Appended to the timeline with source `agent`. |
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
  `list_tasks`) is the internal uuid — get it from **`get_project`**.
- **`patch`** objects use **camelCase** keys (e.g. `statusNote`, `dueDate`, `targetDate`),
  per each tool's row above.
- **`status`** is one of `inbox · backlog · todo · in_progress · in_review · pending ·
  done · cancelled`; **`priority`** is `none · low · medium · high · urgent`.
- **`due_date` / `target_date`** are ISO dates, e.g. `2026-07-15`.

## Caveats

- **POST only.** `GET /mcp` returns `405` — the server is stateless and opens no
  server-initiated SSE stream. Clients that *require* an SSE/session handshake to
  connect may not work; plain tool calls over HTTP POST are fine.
- **401** means the Bearer token is missing or wrong.
- A tool that fails validation returns `isError: true` with the message in the result
  content (not a JSON-RPC error), so agents can read and recover.
