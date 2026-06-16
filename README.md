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
- **One password** guards the door — no accounts, no OAuth. Your data lives in your own Postgres (or a single SQLite file).

## Tech stack

Next.js 16 (App Router / RSC) · React 19 · TailwindCSS 4 · Drizzle ORM + PostgreSQL **or SQLite** ·
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

Pick a database backend — **SQLite** needs no server (the whole DB is one file; great
for trying it out or a local demo), **Postgres** is the production default.

### Database — option A: SQLite (no server)

```bash
pnpm install
cp .env.example .env              # set APP_PASSWORD, COOKIE_SECRET, API_TOKEN — DATABASE_URL not needed
pnpm db:push:sqlite               # create the schema in ./data/iw.db
pnpm db:seed:sample:sqlite        # optional: 4 demo projects + tasks (or `db:seed:sqlite` for just a workspace)
DB_DRIVER=sqlite pnpm dev         # http://localhost:3000
```

The whole database is the single file `./data/iw.db` (override with `SQLITE_PATH`); delete
it to reset. Set `DB_DRIVER=sqlite` on anything that touches the DB — the `*:sqlite` scripts
already do. Full notes (incl. when to prefer Postgres): **[docs/infra/sqlite.md](docs/infra/sqlite.md)**.

### Database — option B: Postgres via Docker (recommended for production parity)

```bash
docker compose -f docker/compose.postgres-container.yml up -d db   # Postgres on localhost:5432
```

The container creates the role, password, and database (`indiework` / `indiework` /
`indiework`) for you. Set the `DATABASE_URL` host to `127.0.0.1:5432` in `.env`.

### Database — option C: standalone Postgres (no Docker)

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

### Then run the app (Postgres)

```bash
pnpm install
cp .env.example .env                             # set APP_PASSWORD, COOKIE_SECRET, API_TOKEN (+ DATABASE_URL host)
pnpm db:migrate                                  # apply migrations
pnpm db:seed                                     # default workspace
pnpm db:seed:sample                              # optional demo project + tasks
pnpm dev                                         # http://localhost:3000
```

Scripts: `pnpm typecheck`, `pnpm test` (Vitest), `pnpm db:generate` (new migration from schema),
`pnpm db:studio`. SQLite equivalents: `db:push:sqlite`, `db:seed:sqlite`, `db:seed:sample:sqlite`, `db:studio:sqlite`.

## Deploy

Three ways to ship it, documented under [`docs/infra/`](docs/infra/):

- **[Vercel + Supabase](docs/infra/deploy-vercel-supabase.md)** — no server to manage; Vercel builds/serves, Supabase is managed Postgres.
- **[VPS + Docker](docs/infra/deploy-vps.md)** — self-host on your own box (Postgres in a container or on the host).
- **[CI/CD → VPS](docs/infra/ci-cd.md)** — GitHub Actions builds the image, pushes to GHCR, the VPS just pulls.

Prefer a zero-dependency backend (no Postgres) for a self-host or demo? See **[SQLite](docs/infra/sqlite.md)**.

## Environment

| Var | Purpose |
|---|---|
| `DB_DRIVER` | `postgres` (default) or `sqlite` — picks the database backend |
| `DATABASE_URL` | Postgres connection string (required when `DB_DRIVER=postgres`) |
| `SQLITE_PATH` | SQLite file path when `DB_DRIVER=sqlite` (default `./data/iw.db`) |
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
