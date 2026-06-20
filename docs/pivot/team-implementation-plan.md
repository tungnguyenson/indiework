# IndieWork → Path 1: one multi-tenant platform, team = capability tier

> **Decision (locked): Path 1.** IndieWork is **one** codebase, **one** deployment, **one** auth. "Solo" and "Team" are the *same product at different capability tiers* on a workspace — a `workspace.plan` flag gates collaborative features. Upselling solo → team is **flipping a flag, zero migration**.
>
> This supersedes the earlier "two separate apps over a shared core" draft. Identity is **real and lives in the core schema** (already built), not identity-agnostic and not `userId`-null. The monorepo/packages split is now **optional** (code-org nicety), not required.
>
> Companion to [team-gap-analysis.md](team-gap-analysis.md). This is the *how + roadmap*; that doc is the *what/why*. Status: **decided / in progress**.

---

## 1. Why Path 1 (and not two apps)

The earlier plan assumed solo would stay a dumb `APP_PASSWORD` tool, so it proposed two apps sharing an identity-agnostic core. Two facts killed that:

1. **Solo is becoming a hosted multi-tenant SaaS** (many solo users on one deployment, each isolated) → solo needs the *full* identity + tenant backbone anyway.
2. **Identity was already built into the main app** (real `users`, email/password, `userId` in the session, attribution) → the architectural line between solo and team has collapsed to a **per-workspace capability difference** (one member vs many; collab on/off), not a structural one.

So the right shape is one platform where **team is a tier**, exactly how Linear/Notion do solo-vs-team. Benefits: one backbone to maintain, one auth, one billing, and — decisively — a solo user who adds a teammate just **upgrades the workspace**, no export/import between products.

| | Two apps (rejected) | **Path 1 — one platform + tier** |
|---|---|---|
| solo → team upsell | migrate between deployments | flip `workspace.plan`, 0 migration |
| backbone | shared core + 2 apps | 1 app |
| identity | agnostic core, `userId` null in solo | real `userId` everywhere (already built) |
| cost driver | extract packages + 2nd app | tenant boundary + tier gating |

---

## 2. Where we are today (reflects the code)

The identity foundation is **done** — and built the Path-1 way (real identity in the main app):

| Built | Where |
|---|---|
| `users` table — admin + agent roles, nullable email for agents, `passwordHash`, `disabledAt` | [`schema.ts`](../../src/server/db/schema.ts) |
| Email/password login, **session carries `userId`**, role looked up server-side | [`session.ts`](../../src/server/auth/session.ts), [`require-session.ts`](../../src/server/auth/require-session.ts) |
| `requireSession()` gate on every Server Action; login rate-limit; admin seed/reset from env | [`auth/`](../../src/server/auth/) |
| Attribution `createdById` on tasks + comments; legacy backfill | [`user.service.ts`](../../src/server/services/user.service.ts) |
| **Agent-as-user**: MCP/API actions attribute to a real user; Bearer → `api_key` → `userId`; static token `@deprecated` | [`token.ts`](../../src/server/auth/token.ts) |

**Model today = single-tenant with real identity ("team of one").** One admin (+ agent users). What is *not* there yet is the **tenant boundary**: there is no `workspace_members`, services are not scoped by membership, and any second admin would see everything.

---

## 3. Target architecture (Path 1)

```
                         ┌─────────────────────────────────────────┐
   one Next app          │  request → session (userId) ─┐          │
   one deployment        │  or Bearer (api_key → userId)│          │
                         │                              ▼          │
                         │     resolve Ctx { userId, workspaceId,  │
                         │                   role }  via membership │
                         │                              │          │
   every service call ───┼──────────────────────────────┘          │
   takes ctx:            │   reads  → WHERE workspace_id = ctx.ws   │
                         │   writes → stamp created_by/assignee     │
                         │   guard  → can(ctx.role, action)         │
                         │   gate   → workspace.plan unlocks collab │
                         └─────────────────────────────────────────┘

   workspace = the tenant.  workspace_members(userId, workspaceId, role) = the boundary.
   workspace.plan ('solo' | 'team') = the capability tier.
```

**Data-model deltas (all in the one schema):**

| Change | Purpose |
|---|---|
| **`workspace_members`** (`workspaceId`, `userId`, `role`, `status`, `invitedBy`, `joinedAt`) | the tenant boundary; solo = 1 row, team = many |
| **`workspaces.plan`** (`'solo' \| 'team'`) (+ optional `seatLimit`) | the capability tier flag |
| **`invitations`** (`email`, `workspaceId`, `role`, `token`, `expiresAt`, `status`) | onboarding teammates (team tier) |
| **`tasks.assignee_id`** (nullable → users) | assignment — the headline team feature (today only `created_by_id` exists) |
| **`projects_key_unique`** → **`(workspace_id, key)`** | multi-tenant collision fix (today global on `key`) |
| **`USER_ROLE`** → `owner · admin · member · viewer` (+ keep `agent`) | RBAC tiers (today only `admin · agent`) |

**The `Ctx` seam** — real `userId`, never null:

```ts
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export interface Ctx {
  userId: string;           // real — from session or api_key (never null)
  workspaceId: string;      // tenant scope — every query filters by this
  role: Role;               // from workspace_members; gates mutations
}
```

Replaces the current loose `createdById?: string | null` param threaded into a couple of services. Resolution: session/Bearer → `userId` → `workspace_members` lookup → `(workspaceId, role)`.

**Tier gating** — collaborative features check `workspace.plan`:
- `solo`: invitations disabled, `workspace_members` stays single-row, assignee/mention/notification UI hidden, RBAC collapses to owner.
- `team`: invitations on, multi-member, assignment, RBAC enforced, collab UI shown.
The *engine* is identical; the tier only flips features on/off and lifts the member cap.

---

## 4. Roadmap — phases → IW milestones

Each phase ships independently and keeps the app green. Phases map 1:1 to the `IW` milestones (the `Team (pivot)` module).

| Phase | Milestone | State | Scope |
|---|---|---|---|
| **0** | Identity foundation | ✅ **done** | users, email/password, session `userId`, attribution, agent-as-user, token→user |
| **1** | Tenant boundary — membership + scoping + Ctx | ▶ **next/active** | `workspace_members`; real `Ctx`; scope **every** query by membership; `(workspace_id, key)` fix; `assignee_id`; expand roles; tenant-isolation tests |
| **2** | Multi-tenant onboarding | planned | self-signup + workspace bootstrap per user → **unlocks the solo SaaS hosting goal** |
| **3** | Team tier (capability flag) | planned | `workspace.plan`; invitations + accept/decline; member management UI; assignee picker; RBAC **enforcement**; gate collab UI by tier |
| **4** | Collaboration | planned | @mentions, notifications (inbox + email), activity feed, (presence later) |
| **5** | Billing & ops | planned | per-seat billing (Stripe), seat counting off `workspace_members`, queue/worker for email, Postgres prod hardening (pooling, backups) |
| **6** | Monorepo & packages | **optional** | extract `packages/core` + `ui` purely for code organization — *not* required by Path 1 |

**Critical path:** Phase 1 is load-bearing and blocks everything (even solo multi-tenant hosting). Phase 2 alone unlocks the hosted solo SaaS. Phase 3 turns on "team." Phases 4–5 are incremental. Phase 6 is optional and can happen any time (or never).

---

## 5. Sequencing notes

- **Phase 1 is the only hard part left.** It touches every read path (scoping) and replaces the `createdById?` param with `Ctx`. Do it on a branch, behind tenant-isolation tests, before any team UI.
- **Static `API_TOKEN` must die in Phase 1** — [`token.ts`](../../src/server/auth/token.ts) already marks it `@deprecated "remove before any multi-tenant step"`. A shared token can't carry a tenant.
- **Dual schema (pg + sqlite):** hosted multi-tenant prod = **Postgres**. SQLite stays for local/demo only.
- **Migration of existing data:** the single admin becomes the **owner** of the existing workspace via one `workspace_members` row; `createdById` is already backfilled. Trivial — no user-minting needed (it was done in Phase 0).
