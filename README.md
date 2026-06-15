<div align="center">

# IndieWork

**Calm, single-user project management for solo indie devs.**
Self-hostable · open source · [indiework.space](https://indiework.space)

</div>

IndieWork is a project manager for one person. No assignees, no notifications, no
team ceremony — just your projects, two independent ways to group them, and an inbox
for everything else. One core service layer is exposed through **three front doors**:
a web UI, a REST API, and an MCP server — so the app, a shell script, and an AI agent
all do exactly the same thing.

## Highlights

- **Module ⟂ Milestone** — group tasks by sub-system *or* by phase, independently. A task belongs to both.
- **Inbox / quick capture** — dump an idea with zero required fields (`c` anywhere), triage it later.
- **Status note ≠ comments** — a pinned line answers "where is this right now?"; the timeline logs what you tried.
- **Slide-in detail panel**, board (kanban), grouped list with multi-select bulk actions, ⌘K command palette.
- **REST API** (`/api/v1`) and **MCP server** (`/mcp`) over the same service layer.
- **One password** guards the door — no accounts, no OAuth. Your data lives in your Postgres.

## Tech stack

Next.js 16 (App Router / RSC) · React 19 · TailwindCSS 4 · Drizzle ORM + PostgreSQL ·
`@modelcontextprotocol/sdk` · pnpm. Auth is a `.env` password + signed cookie (web) and a
Bearer token (API/MCP).

## Quickstart (self-host)

You need Docker. From the repo root:

```bash
cp .env.example .env      # then edit: set APP_PASSWORD, COOKIE_SECRET, API_TOKEN
docker compose -f docker/compose.postgres-container.yml up -d
```

Open <http://localhost:3000>, log in with `APP_PASSWORD`, and you're in. The container
runs migrations + seeds a default workspace on boot; Postgres data persists in a volume.

> Already run Postgres on the host and only want the app in Docker? Use
> `docker compose -f docker/compose.postgres-host.yml up -d` instead — it connects to your
> host Postgres via `host.docker.internal` (see comments at the top of that file).

> Generate a cookie secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Local development

First get a Postgres database — pick **one** of the two options below — then run the app.

### Database — option A: Docker (recommended)

```bash
docker compose -f docker/compose.postgres-container.yml up -d db   # Postgres on localhost:5432
```

The container creates the role, password, and database (`indiework` / `indiework` /
`indiework`) for you. Set the `DATABASE_URL` host to `127.0.0.1:5432` in `.env`.

### Database — option B: standalone Postgres (no Docker)

If you already run Postgres locally (Homebrew, Postgres.app, apt, …) on the default port
`5432`, create the role and database once. Connect as a superuser, then:

```bash
# macOS (Homebrew / Postgres.app) — your macOS user is usually a superuser:
psql postgres -c "CREATE ROLE indiework WITH LOGIN PASSWORD 'indiework';"
psql postgres -c "CREATE DATABASE indiework OWNER indiework;"

# Linux — connect through the postgres system account instead:
sudo -u postgres psql -c "CREATE ROLE indiework WITH LOGIN PASSWORD 'indiework';"
sudo -u postgres psql -c "CREATE DATABASE indiework OWNER indiework;"
```

`indiework` owns the database, so migrations can create tables in the `public` schema with
no extra `GRANT` (Postgres 15+). Keep the `DATABASE_URL` host at `127.0.0.1:5432` (the
`.env.example` default) — use `127.0.0.1`, not `localhost`, to dodge an IPv6 stall on
macOS. You may pick any role/password/db names; just match them in `DATABASE_URL`.

### Then run the app

```bash
pnpm install
cp .env.example .env                             # set APP_PASSWORD, COOKIE_SECRET, API_TOKEN (+ DATABASE_URL host)
pnpm db:migrate                                  # apply migrations
pnpm db:seed                                     # default workspace
pnpm db:seed:sample                              # optional demo project + tasks
pnpm dev                                         # http://localhost:3000
```

Scripts: `pnpm typecheck`, `pnpm test` (Vitest), `pnpm db:generate` (new migration from schema), `pnpm db:studio`.

## Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `APP_PASSWORD` | Web login password (single user) |
| `COOKIE_SECRET` | Signs the session cookie (≥ 32 chars) |
| `API_TOKEN` | Bearer token for the REST API + MCP |

## REST API

Base `/api/v1`. Header `Authorization: Bearer $API_TOKEN`. Responses are `{ data, error }`.

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/tasks` | Create a task (no project → Inbox) |
| `GET` | `/tasks` | List (`?projectId`, `?status=a,b`, `?priority=`, `?moduleId`, `?milestoneId`, `?inbox`, `?hideDone`) |
| `GET`/`PATCH` | `/tasks/:id` | Get / update a task |
| `POST` | `/tasks/:id/comments` | Append a timeline comment |
| `GET` | `/projects` | List projects |
| `GET` | `/inbox` | Untriaged Inbox tasks |

```bash
curl -X POST localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Remember to do X"}'
```

## MCP server

`POST /mcp` speaks JSON-RPC 2.0 (stateless streamable-HTTP), Bearer-guarded. Tools:
`create_task`, `add_subtask`, `list_tasks`, `get_task`, `update_task`, `add_comment`,
`set_status_note`, `list_projects`, `list_inbox`. Point any MCP client (Claude Code,
Claude Desktop, Cursor, n8n, …) at the endpoint with the `API_TOKEN` as a Bearer header.

See **[`docs/mcp.md`](docs/mcp.md)** for client config snippets and the full tool reference.

## Architecture & design

All three front doors call one service layer (`src/server/services/*`); adapters stay
thin. See [`docs/scope.md`](docs/scope.md) for the product source-of-truth,
[`docs/roadmap.md`](docs/roadmap.md) for what's built vs planned, and `docs/brainstorm/`
+ `design-handoff/` for the original spec and UI design.

## License

[MIT](LICENSE).
