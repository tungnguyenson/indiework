# IndieWork → Team — Gap Analysis

> What it takes to fork the current **single-user** IndieWork into a **team / multi-user** product.
>
> This is not a feature list — it is a map of the **identity / tenancy / authorization backbone that does not exist today**. Collaboration features (assignee, mentions, notifications) sit *on top* of that backbone and are cheap by comparison.
>
> Companion to [../scope.md](../scope.md) (single-user source of truth) and [../roadmap.md](../roadmap.md). Status: **analysis / not yet decided**.

---

## 1. Starting point — the app is single-user by design

The code states this explicitly; the gap is structural, not cosmetic.

| Fact | Evidence |
|---|---|
| **No `users` table.** Login = matching one `APP_PASSWORD`; the signed cookie proves "authenticated" but carries **no identity**. | [`src/server/auth/session.ts`](../../src/server/auth/session.ts) — *"No user table — the single source of truth is .ENV"* |
| **One static `API_TOKEN`** shared by REST `/api/v1` and MCP. | [`src/server/auth/token.ts`](../../src/server/auth/token.ts) |
| **`workspaces` exists but is just a container** — no owner, no members. "Active" workspace comes from a browser cookie, not a user. | [`src/server/active-workspace.ts`](../../src/server/active-workspace.ts) — `getDefault()` = *"the single-user home"* |
| **Tasks have no assignee/reporter; comments have no author** (only `source`: web/api/agent). | [`src/server/db/schema.ts`](../../src/server/db/schema.ts) |
| Product self-description: *"a calm, single-person tool… No assignees."* | landing page + [../scope.md §1](../scope.md) |

**Implication:** "going team" means building identity, multi-tenancy, and authorization first. Every existing service method trusts its caller and is unscoped — that is safe with one user and a data leak with two.

---

## 2. Gaps by priority

### P0 — Backbone (nothing collaborative is safe without these)

#### 2.1 Identity & authentication
| Today | Team needs |
|---|---|
| No `users` | `users` (email, name, avatar, `password_hash` / OAuth identity, timestamps) |
| One shared `APP_PASSWORD` | Real auth (email+password, OAuth/SSO, or magic link); **session must carry `userId`** |
| Cookie = "authenticated" only | Session/token bound to (user, workspace) context |
| No account lifecycle | Sign-up, email verification, password reset, onboarding |
| One static `API_TOKEN` | **Per-user** API keys — `api_keys` is reserved but unbuilt **and has no `userId`/`workspaceId` column** ([schema.ts](../../src/server/db/schema.ts)) |

> **Security:** the shared-password + shared-token model must be **removed**, not kept alongside. In a multi-tenant app, one leaked token = full access to every tenant.

#### 2.2 Multi-tenancy & membership (the data-model spine)
- **`workspace_members`** (`workspaceId`, `userId`, `role`, `invitedBy`, `joinedAt`, `status`) — the tenant boundary.
- **`invitations`** (`email`, `workspaceId`, `role`, `token`, `expiresAt`, `status`) + invite email + accept/decline flow.
- **Scope every query to the caller's workspaces.** Today `workspaceService.list()` returns **all** workspaces unconditionally ([workspace.service.ts](../../src/server/services/workspace.service.ts)) — a leak the moment a second user exists.
- **Unique-key bug that *will* fire:** `projects_key_unique` is on **`key` alone (global)** ([schema.ts](../../src/server/db/schema.ts)). Multi-tenant must change it to **`(workspaceId, key)`**, else two teams can't both own a "WEB" project. (Task `ref`/`seq` via `project_counters` is already per-project — fine.)
- **Decision:** is `workspace` the tenant, or is an `organization` layer needed above it (org → many workspaces)?

#### 2.3 Authorization / RBAC
- Today: **none** — binary "logged in or not." The service layer takes no actor and enforces nothing.
- Need roles (**owner / admin / member / viewer-guest**) and a permission check on **every mutation** (edit project? delete task? manage members? change billing?).
- Mechanism: thread an `actor` (`userId` + `role`) through each `*.service.ts` method, or wrap them in a guard/policy layer. This is a **cross-cutting refactor of the whole service layer**, not a new module.

---

### P1 — The actual value of "team", plus what makes it safe to ship

#### 2.4 Collaboration features
- **Tasks:** add `assigneeId` + `createdById` (reporter). This is the headline feature — and exactly what the product says it lacks today. (Multiple assignees / watchers = later.)
- **Comments:** add `authorId`. The timeline is currently anonymous.
- **@mentions** in comment/description → trigger notifications.
- **Notifications:** new table + delivery (in-app inbox, email, optional push). None exists.
- **Activity feed / audit log:** who did what, when. None exists; mandatory for teams.
- **Real-time / presence:** live updates when a teammate changes data. Today is server-component reads + cookie — no SSE/websocket. Minimum bar: optimistic concurrency / conflict handling (see [../adr/0002-optimistic-updates.md](../adr/0002-optimistic-updates.md)).
- **Per-person views:** "assigned to me", workload per member.

#### 2.5 Data migration (existing single-user → team)
Existing data has no owner and some projects may have a null `workspaceId` (legacy). Migration: create a user from the existing instance → make them workspace **owner** → attach all projects → backfill `createdById` on tasks/comments to that user.

#### 2.6 MCP / API attribution (a signature surface here)
- MCP is currently one user-scoped token. For team, the token must map to **(user, workspace)**.
- `create_task` must set `createdById` = the token's user; `add_comment` must set author; agent actions must attribute to a real user. REST `/api/v1` identical. See [../adr/0001-mcp-as-agent-surface.md](../adr/0001-mcp-as-agent-surface.md).

#### 2.7 Infrastructure & database
- **SQLite** (branch `demo-sqlite`, [../infra/sqlite.md](../infra/sqlite.md)) is fine for single-user/demo but has a **single-writer lock** — concurrent team writes risk "database is locked." Production team path should be **Postgres**; keep SQLite for local/demo.
- **Dual schema** (`schema.ts` + `schema.sqlite.ts`): every new table (users, members, invitations, notifications…) must be maintained twice.
- **Background jobs:** email + notification delivery needs a queue/worker — none today.
- Connection pooling, backups, and a migration strategy for live multi-tenant data.

#### 2.8 Billing / plans (if commercialized)
Per-seat billing, plan tiers, seat limits, trial, Stripe (or similar), seat counting off `workspace_members`. None today.

---

### P2 — UI/UX surface
Member management (`settings/workspace` → invite, roles), avatars, assignee picker, mention autocomplete, notification center, per-user preferences, signup / invite-accept pages (today `/login` is one password field), new-team onboarding.

---

## 3. Decisions required before building

1. **Fork a separate repo, or one codebase with a "team mode"?**
   **Recommendation: do not hard-fork.** Build `users` + membership + authZ as the backbone inside this repo and treat single-user as a "team of one." A hard fork makes the two branches diverge and forces every bug fix to be ported twice.
2. **Tenant boundary:** `workspace` = tenant, or add an `organization` layer above it?
3. **Production DB for team:** commit to Postgres, with SQLite only for local/demo?

---

## 4. Suggested sequencing

```
users + real login
  → workspace_members + scope every query
    → RBAC guard at the service layer
      → assigneeId / authorId + migration backfill
        → notifications / activity feed
          → billing
```

The first three steps are **necessary conditions** — until they exist, every collaboration feature is built on an unsafe foundation. Everything from step four on is incremental.

---

## 5. Effort signal (rough)

| Area | Shape of work |
|---|---|
| Identity + sessions | New subsystem; replaces `APP_PASSWORD` auth wholesale |
| Membership + query scoping | New tables + touches **every** read path |
| RBAC | Cross-cutting refactor of `src/server/services/*` |
| Collaboration columns | Additive schema + dual-schema upkeep + UI |
| Notifications / activity | New tables + worker + UI surface |
| Billing | New subsystem + 3rd-party integration |

The cost center is **#2 and #3** (scoping + authZ), because they touch existing code rather than adding alongside it. Plan them first and explicitly.
