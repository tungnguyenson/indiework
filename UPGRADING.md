# Upgrading IndieWork (identity + attribution)

If you installed IndieWork **before** the identity/attribution release, follow these steps
after `git pull`:

## 1. Update environment variables

Add to your `.env` (or Docker env file):

```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=your-secure-password
```

`ADMIN_EMAIL` / `ADMIN_PASSWORD` become your web login credentials. The seed script
creates the admin user on first boot after migration.

Keep your existing `COOKIE_SECRET` and `API_TOKEN` — they still work:

- **`API_TOKEN`** — still accepted as a Bearer token for REST/MCP, but is **deprecated**.
  It maps to a `default-agent` user so existing MCP clients keep working. Plan to migrate
  to per-agent API keys before any multi-tenant deployment.
- **`APP_PASSWORD`** — no longer used. You can remove it from `.env`.

## 2. Run migrations + seed

**Postgres (Docker or local):**

```bash
pnpm db:migrate
pnpm db:seed
```

Docker images run `migrate && seed` automatically on boot.

**SQLite:**

```bash
pnpm db:push:sqlite
pnpm db:seed:sqlite
```

## 3. Restart the app

```bash
docker compose restart app   # or your deploy method
```

## 4. Sign in with email + password

The `/login` screen now asks for **email + password** instead of a single shared password.
Use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set above.

## What changed

- New `users` table (admin + agent identities)
- Tasks and comments track `createdById` (who created them)
- Agent comments show an **Agent** badge in the UI
- MCP/REST writes attributed to the authenticated agent user
- Legacy rows backfilled automatically by `db:seed`

## Forks on older data

The seed backfill is idempotent:

| Legacy data | Assigned to |
|---|---|
| Comments with `source` = mcp or agent | `default-agent` |
| Comments with `source` = web or api | admin |
| All tasks without `createdById` | admin |

No manual SQL required.

## Reset admin password

`ADMIN_PASSWORD` in `.env` is only read when the admin user is **first created** (`db:seed`).
Changing it later does **not** update the database automatically.

1. Set the new password in `.env`:

```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=new-password-here
```

2. Sync the hash:

```bash
pnpm db:reset-admin-password          # Postgres
# or
pnpm db:reset-admin-password:sqlite   # SQLite
```

3. Sign in at `/login` with the new password.

This only updates `users.password_hash` for the matching admin email. Your tasks,
comments, and projects are untouched.
