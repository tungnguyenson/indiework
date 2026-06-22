# Splitting **Teamspace** out of IndieWork — execution checklist

> Goal: stand up a **separate** repo at `/Volumes/DATA/dev/projects/teamspace` for the
> team / multi-tenant product, fully decoupled from `indiework` (the solo / indie path).
> Date: 2026-06-21 · Owner: Tung

---

## TL;DR — the strategy

The team work lives on branch **`feat/team-tenant-boundary`** and is **NOT merged into
`main`** (15 commits ahead, ~23k insertions). So:

| Repo | Becomes | Starts from |
|---|---|---|
| **`indiework`** (existing) | the **solo / indie** product | stays at **`main`** — do *not* merge the team branch |
| **`teamspace`** (new) | the **team / multi-tenant** product | a copy of the repo at **`feat/team-tenant-boundary`** (already built + green) |

This is a **promote-and-decouple**, not a strip-and-surgery. Teamspace is born working
(it's a copy of a passing branch); indiework is born clean (it just never takes the merge).

After the split the two repos **diverge independently**. No shared package for now
(YAGNI) — revisit only if drift actually hurts.

---

## Phase 0 — Decisions to lock first

- [ ] **D1 · Identity of teamspace.** Pick concrete values (drives every rebrand below):
  - Product name: `Teamspace` (or final name)
  - npm package `name`: `teamspace`
  - Primary domain / `APP_URL`: `https://app.teamspace.____`
  - DB name: `teamspace`
  - Cookie prefix: `ts_session` / `ts-workspace` (must differ from `iw_*` — see Phase 3)
  - IndieWork tracking project KEY: new key, e.g. `TS` (separate from `IW`)
- [ ] **D2 · Git history.** Keep history (recommended — preserves IW-* commit provenance)
      vs. fresh `git init`. Default below assumes **keep history**.
- [ ] **D3 · indiework's solo backbone.** Leave indiework at `main` as-is (recommended for
      now), OR backport the *shared* improvements that solo also benefits from. Candidates,
      from the branch log (cherry-pick later, separate effort — not required for the split):
  - `b7d0f3a` thread `Ctx` through service layer (IW-26/27/37/62)
  - `7d493c6` remove static `API_TOKEN` auth path (IW-58) — security hardening
  - `1771da3` self-signup + first-workspace onboarding (IW-59/60)
- [ ] **D4 · Shared code.** Confirm **full divergence** (two independent repos). No
      `packages/core` extraction. (If you ever want it, it's the optional Phase 6 from
      `docs/pivot/team-implementation-plan.md`.)

---

## Phase 1 — Stand up the `teamspace` repo

- [ ] Copy the repo at the **team branch** state (keeps history):
  ```bash
  git clone /Volumes/DATA/dev/projects/indiework /Volumes/DATA/dev/projects/teamspace
  cd /Volumes/DATA/dev/projects/teamspace
  git checkout feat/team-tenant-boundary
  git branch -m feat/team-tenant-boundary main   # make team work the new main
  git branch -D main 2>/dev/null || true          # drop the old solo main if present
  ```
- [ ] Detach from indiework's git origin and set the new remote:
  ```bash
  git remote remove origin
  # git remote add origin <new teamspace remote>   # when the remote exists
  ```
- [ ] Drop build/state artifacts that shouldn't carry over: `.next/`, `data/` (local
      sqlite/db files), `tsconfig*.tsbuildinfo`, `.design-sync/` if not wanted.
- [ ] Record the divergence point in teamspace: add `docs/FORKED-FROM.md` noting
      "forked from indiework @ `<sha of feat/team-tenant-boundary>` on 2026-06-21".
- [ ] On the **indiework** side: tag the branch for provenance, then stop developing it
      here. `git tag teamspace-split-point feat/team-tenant-boundary`. Decide whether to
      delete `feat/team-tenant-boundary` from indiework (recommended once teamspace is green).

---

## Phase 2 — Rebrand & identity (teamspace repo)

~25 files reference `indiework`. Rebrand the **product/brand** ones; leave architecture
prose alone unless it's user-facing.

- [ ] `package.json` → `"name": "teamspace"`, reset `version`, update description.
- [ ] Brand/UI: `src/components/ui/brand.tsx`, `src/app/layout.tsx` (title/metadata),
      `src/app/page.tsx` (landing), `src/app/login/page.tsx`, `src/app/signup/page.tsx`,
      `src/app/onboarding/page.tsx`, `src/styles/landing.css`, `src/app/icon.svg`.
- [ ] Email templates (sender name + body copy): `src/server/email/invite-email.ts`,
      `verify-email.ts`, `notification-email.ts`, `transport.ts`.
- [ ] MCP server name: `src/app/mcp/route.ts`.
- [ ] Env defaults: `src/server/env.ts` — `EMAIL_FROM` default (`IndieWork <noreply@…>`),
      `APP_BASE_URL` default (`https://app.indiework.space`), Mailgun fallback domain.
- [ ] Misc strings: `src/server/db/seed-sample.ts`, `src/server/db/schema.ts`,
      `src/server/auth/rate-limit.ts`, `src/components/app/settings.tsx`,
      `src/app/verify/[token]/verify-screen.tsx`, `src/app/invite/[token]/accept-screen.tsx`.
- [ ] `README.md`, `CLAUDE.md` (point to the new IndieWork project KEY from D1).
- [ ] CI/deploy: `.github/workflows/deploy.yml`, `docker/Dockerfile`,
      `docker/compose.*.yml` (image name `ghcr.io/.../indiework`, comments, hostnames).

---

## Phase 3 — Decouple shared infrastructure ⚠️ (collision-critical)

Both apps will run on `localhost` during dev — **cookies are not isolated by port**, so
the session/workspace cookies WILL clobber each other unless renamed. Everything below
must get a teamspace-specific value.

| Resource | indiework (today) | teamspace (set to) | Where |
|---|---|---|---|
| Session cookie | `iw_session` | `ts_session` | `src/server/auth/session.ts:8` |
| Workspace cookie | `iw-workspace` | `ts-workspace` | `src/server/active-workspace.ts:10` |
| Postgres DB | `indiework` @ 5432 | `teamspace` (own DB or own port) | `.env`, `docker/compose.postgres-container.yml` |
| `COOKIE_SECRET` | (its own) | **new random** 32+ char | `.env` |
| `API_TOKEN` | (its own) | **new** | `.env` |
| `APP_URL` | `app.indiework.space` | teamspace domain | `.env`, `env.ts` default |
| Mailgun domain/from | `*.indiework.space` | teamspace sending domain | `.env` |
| R2 bucket / public URL | `indiework` / `files.indiework.space` | teamspace bucket | `.env` |
| Docker `POSTGRES_DB/USER` | `indiework` | `teamspace` | `docker/compose.postgres-container.yml:13-15` |
| Container image | `ghcr.io/.../indiework` | `ghcr.io/.../teamspace` | `docker/compose.prod.yml`, `Dockerfile` |
| Dev port (if both run) | `3000` | `3001` (or distinct) | run scripts |
| Vercel project | indiework | new teamspace project + its own env | Vercel dashboard |

- [ ] Rebuild `.env` from `.env.example` with **all** teamspace values (don't copy
      indiework's `.env` — it carries live R2/Mailgun/DB creds for the other product).
- [ ] (Cosmetic, optional) localStorage `iw-*` prefix in `src/lib/use-local-storage.ts` —
      localStorage **is** origin-scoped (port-specific), so no real collision; rename only
      for tidiness.

---

## Phase 4 — Diverge the code (what each side keeps)

- [ ] **teamspace keeps everything** on the branch: `workspace_members`, invitations, RBAC
      (`src/lib/roles.ts`), members UI, mentions (`src/lib/mentions.ts`), notifications,
      activity feed, email queue/worker (`src/server/email/*`), cycles design docs.
- [ ] **Optional teamspace simplification:** if team is Postgres-only in prod, you may drop
      the SQLite driver path later. **Don't do it during the split** — keep the repo green
      first; remove sqlite as a follow-up if desired.
- [ ] **indiework (solo)** needs **no code removal** — it's already at the lean `main`.
      Only act here if you chose to backport shared improvements (D3).

---

## Phase 5 — Verify teamspace stands alone

- [ ] `pnpm install` clean (own lockfile).
- [ ] `pnpm db:migrate` against the **teamspace** DB, then `pnpm db:seed`.
- [ ] `pnpm build` green.
- [ ] `pnpm test` green (note: int tests need a reachable Postgres — point them at the
      teamspace DB / test DB).
- [ ] Smoke the team-tier flow end-to-end: sign up → bootstrap workspace → create invite →
      **Copy link** (works without email) → accept in a second session → assign + @mention →
      see in-app notification. Then, if Mailgun is set, confirm the worker/cron drains.
- [ ] Confirm **both apps run simultaneously** on localhost without cookie/session bleed
      (validates Phase 3 cookie renames).

---

## Phase 6 — Tracking & docs

- [ ] Create a **new IndieWork project** for teamspace (KEY from D1, e.g. `TS`); update
      `teamspace/CLAUDE.md` to default to it. Move the relevant `IW` "Team (pivot)"
      milestone/tasks over, or relabel.
- [ ] Update `indiework/docs/architecture.md` + `roadmap.md`: scope is now **solo only**;
      link out to the teamspace repo for the team product. Trim the `docs/pivot/*` set that
      no longer applies to solo (or move it to teamspace).
- [ ] Write a one-paragraph **backport policy**: which kinds of fixes (security, shared bug
      fixes in the service layer) get manually ported between the two repos, and which don't.

---

## Gotchas (carry-over from prior work)

- **Drizzle journal can silently skip migrations.** `_journal.json` had future-dated entries
  (0003/0005) that made `db:migrate` skip *newer* migrations. When teamspace runs migrations
  fresh, verify every migration actually applies; bump a new migration's `when` above the max.
- **macOS Postgres:** use `127.0.0.1`, not `localhost` (IPv6 `::1` stall with node-postgres).
  Local Postgres is `5432`; the Docker compose Postgres maps differently — keep teamspace's
  port distinct if both run.
- **`projects.workspaceId` is `set null`** on workspace delete → orphans. Same in teamspace.

---

## Appendix — quick collision cheat-sheet (rename these in teamspace)

```
iw_session      → ts_session        (src/server/auth/session.ts)
iw-workspace    → ts-workspace      (src/server/active-workspace.ts)
DB indiework    → DB teamspace      (.env, docker compose)
bucket indiework→ bucket teamspace  (.env R2_*)
app.indiework.space → teamspace domain (.env APP_URL, env.ts default)
new COOKIE_SECRET, new API_TOKEN, new Mailgun creds (never reuse indiework's)
```
