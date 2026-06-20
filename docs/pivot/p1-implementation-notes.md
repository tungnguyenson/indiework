# P1 "Tenant boundary" — implementation notes

> Running log of non-obvious decisions made while implementing the P1 tenant
> boundary (Ctx + RBAC) on branch `feat/team-tenant-boundary`. Companion to
> [authorization-design.md](authorization-design.md) (the spec) and
> [team-implementation-plan.md](team-implementation-plan.md) (the roadmap).

## Decisions

### `tasks.workspace_id` — nullable in Inc 1, NOT NULL in Inc 3

The spec wants `tasks.workspace_id` NOT NULL. But the column is added **before**
the service layer stamps it from `Ctx` (that happens in Increment 3). If we ship
NOT NULL in Increment 1, every `INSERT` from the existing test suite
(`tests/services.int.test.ts`, which calls `taskService.create()` without a ctx)
would violate the constraint, breaking "green after each increment".

So:
- **Inc 1:** add `tasks.workspace_id` as a **nullable** FK, backfill existing
  rows (from project's workspace; Inbox → default workspace).
- **Inc 3:** once `create` / `addSubtask` / `assignToProject` stamp `workspaceId`
  from `ctx`, flip the column to **NOT NULL** in a follow-up migration.

The final schema matches the spec; the intermediate state keeps the app green.

### `resolveActiveWorkspace(userId)` becomes membership-backed

Today `resolveActiveWorkspace()` lists **all** workspaces. For multi-tenant it
must take a `userId` and resolve only workspaces the user is a member of, so the
active workspace (and thus `Ctx.workspaceId`) can never point at a tenant the
user doesn't belong to. The cookie value is validated against membership; we fall
back to the user's first membership.

### Bearer resolution returns `{ userId, workspaceId, scope }`

`resolveBearer` historically returned only `userId`. The Ctx resolver for
REST/MCP needs the workspace the api_key is bound to, so a new
`resolveBearerCtx(req)` returns `{ userId, workspaceId, scope } | null`. The
legacy static `API_TOKEN` resolves to (default-agent user, default workspace) so
a Ctx can still be built — see TODO(IW-58).

### `api_keys.workspaceId` added (nullable)

The bearer resolver needs to know which workspace a key is bound to. Added as a
nullable FK→workspaces; the legacy-token and ensure-key paths fall back to the
default workspace when null.

### `can()` guards mutations only; reads are tenant-scoped

Per design §6/§8, reads do **not** go through `can()` — read permission is the
tenant scope (`WHERE workspace_id = ctx.workspaceId`). Cross-tenant reads return
`not_found` (not `forbidden`) so object existence in another tenant isn't leaked
(design §9).

### `api_key.scope ∩ role` capping deferred to IW-58

Design §11 describes capping an agent's effective permissions by the api_key
scope. That (plus full static-token removal) is **IW-58**, a later task. Inc 3's
mutation guard is just `can(ctx.role, action)`.

### `users.role` migrates `'admin' → 'human'`

Authorization role lives on `workspace_members`, not `users`. `users.role` is now
only the account type `human | agent` (design §3). Existing `'admin'` rows →
`'human'`.
