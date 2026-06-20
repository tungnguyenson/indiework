# IndieWork → Team — Implementation Plan (two products, shared engine)

> Decision: **indie and team are two separate products** that must keep existing independently — indie stays deliberately simple ("calm, no assignees"), team is a different, collaborative product. We share the **engine**, not the app, via a pnpm monorepo.
>
> Companion to [team-gap-analysis.md](team-gap-analysis.md). This is the *how*; that doc is the *what/why*. Status: **plan / not started**.

---

## 1. The core idea

Do **not** copy-paste the repo (divergence) and do **not** rebuild from scratch (throws away a working product). Instead restructure the current flat Next app into a **pnpm monorepo** where ~80% of the code — the service layer, schema, domain, validators — lives once in `packages/core`, consumed by two thin apps.

The single move that makes one engine serve two products: **services stop assuming a single user/tenant and instead accept an injected `Ctx` (actor + tenant scope).** Indie supplies a constant "team-of-one" ctx; team resolves a real ctx per request from session + membership.

```
core is tenant-scoped but identity-agnostic:
  it knows workspaceId / userId / role — it does NOT know how users or
  membership are stored. That lives in the team app.
```

---

## 2. Target structure

```
indiework/                         (monorepo root, pnpm workspace)
├─ packages/
│  ├─ core/                        the shared engine
│  │  ├─ domain/                   was src/lib/domain (enums, constants)
│  │  ├─ db/                       was src/server/db (schema.ts, schema.sqlite.ts, index, migrate, seed)
│  │  ├─ services/                 was src/server/services (task, project, milestone, module, comment, workspace)
│  │  ├─ validators/               was src/server/validators
│  │  └─ context.ts                NEW — the Ctx type services accept
│  └─ ui/                          (optional, later) shared tokens + primitives
├─ apps/
│  ├─ indie/                       the CURRENT app, moved wholesale
│  │  ├─ src/app/                  web UI + /mcp + /api/v1
│  │  ├─ src/server/auth/          password session + static bearer  (stays per-app)
│  │  ├─ src/server/env.ts         APP_PASSWORD, API_TOKEN          (stays per-app)
│  │  └─ active-workspace.ts       cookie-based                      (stays per-app)
│  └─ team/                        NEW app
│     ├─ src/app/                  web UI + /mcp + /api/v1 (team ctx)
│     ├─ src/server/auth/          real users + sessions + RBAC
│     ├─ src/server/identity/      users · workspace_members · invitations (team-only schema)
│     └─ ...
└─ pnpm-workspace.yaml             add `packages/*`, `apps/*`
```

**What goes where — the split is clean:**

| Belongs in `core` (shared) | Belongs in each app (per-product) |
|---|---|
| `db/` (schema, migrate, seed) | `auth/` (how you log in) |
| `services/` (business logic) | `env.ts` (APP_PASSWORD vs users) |
| `validators/` | `active-workspace` resolution |
| `domain/` (enums) | Next `app/` routes + UI screens |
| `context.ts` (the `Ctx` *interface*) | Ctx *resolution* (who is the caller) |
| identity-agnostic tenant scoping | identity tables (`users`, `members`) |

---

## 3. The `Ctx` seam (the load-bearing change)

`packages/core/context.ts`:

```ts
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface Ctx {
  workspaceId: string;        // tenant scope — every query filters by this
  userId: string | null;      // stamps created_by_id / author_id (null in indie)
  role: Role;                 // authorization gate (always 'owner' in indie)
}
```

Every service method takes `ctx` as its first argument:

```ts
// before:  taskService.create(input)
// after:   taskService.create(ctx, input)
//   - reads  → WHERE workspace_id = ctx.workspaceId
//   - writes → set created_by_id = ctx.userId
//   - guard  → assert(can(ctx.role, 'task:create'))
```

- **apps/indie** builds a constant ctx: `{ workspaceId: <the one workspace>, userId: null, role: 'owner' }`. Behavior is identical to today — single-user, no assignee.
- **apps/team** resolves ctx per request from the session → membership lookup → role.

This refactor is required in **every** path; it is never wasted work.

---

## 4. Schema deltas (in `core`, both products inherit)

1. **Fix the multi-tenant uniqueness bug now:** `projects_key_unique` on `key` → **`(workspace_id, key)`**. Indie (one workspace) is unaffected; team needs it.
2. **Add nullable attribution columns** as bare uuids (no hard FK to a users table, since indie has none): `tasks.assignee_id`, `tasks.created_by_id`, `comments.author_id`. Indie leaves them null; team populates them and adds its own FK via a team-only migration.

Identity tables (`users`, `workspace_members`, `invitations`, `notifications`, `activity`) live in **apps/team**, not core. Team production targets **Postgres**; SQLite stays the indie/local/demo path (avoids the single-writer lock for concurrent team writes — see [team-gap-analysis.md §2.7](team-gap-analysis.md)).

---

## 5. Phased migration (green after every phase)

Each phase is independently shippable and reversible. Use `git mv` throughout to preserve history.

| Phase | Work | Risk |
|---|---|---|
| **0 — Monorepo skeleton** | Add workspace globs; `git mv` the whole current app into `apps/indie/`. No behavior change. Build + tests green. | Low (mechanical) |
| **1 — Extract `packages/core`** | `git mv` `db` + `services` + `validators` + `lib/domain` into `core`. Add package.json/tsconfig/exports. Swap `@/server/*` imports → `@indiework/core`. Introduce `Ctx` with a default team-of-one. Green. | Low–med |
| **2 — Make services ctx-aware** | Thread `ctx` through every service method; scope reads, stamp writes, gate by role. Fix `(workspace_id, key)`. Add nullable attribution columns. Indie still single-user. Green. | **Med (touches every read path)** |
| **3 — Extract `packages/ui`** *(optional)* | Share tokens + low-level primitives only; let each app own its screens. Defer if indie/team UIs diverge a lot. | Low |
| **4 — Scaffold `apps/team`** | New Next app importing `@indiework/core`. Identity tables + real auth + invitation flow. Per-request ctx from session+membership. RBAC. Team-only UI (members, assignee picker). | High (new product) |
| **5 — Team features** | Mentions → notifications, activity feed, billing. Iterative. | Incremental |

**Phases 0–2 are the foundation and the highest-leverage work** — they convert the codebase into a shared engine and are prerequisites for the team app. Do them first, on a branch, before any team UI exists.

---

## 6. Surfaces that need a per-app decision

- **MCP `/mcp` + REST `/api/v1`:** thin dispatchers over services. The protocol/dispatch logic is shareable; **auth + ctx resolution differs** (indie: static token → team-of-one; team: token → user+workspace). Start by reusing the dispatch shell and injecting ctx resolution per app; extract to core later if duplication hurts.
- **Dual schema (pg + sqlite):** team only needs Postgres. Keep both in core but team migrations target pg only.
- **Seed scripts:** core owns the shared seed; each app seeds its own auth/identity fixtures.

---

## 7. Why this beats copy-paste, restated

| | Copy-paste fork (rejected) | Monorepo + core (this plan) |
|---|---|---|
| Bug fix in shared logic | port by hand to 2 repos | fix once in `core` |
| Schema/service drift | guaranteed within weeks | impossible — one source |
| Indie stays simple | yes, but frozen by neglect | yes, by design (no team UI) |
| Upfront cost | low | **Phases 0–2** (the ctx refactor) |
| Cost is required anyway | n/a | yes — ctx/tenant seam is needed for team regardless |

The upfront cost (Phases 0–2) is exactly the work the team product needs no matter what. So it is paid once and shared, never duplicated.
