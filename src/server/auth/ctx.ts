/**
 * Security context (`Ctx`) + authorization policy — the heart of the tenant
 * boundary. See docs/pivot/authorization-design.md §5–§7.
 *
 * A `Ctx` answers the three questions every request must (who / which tenant /
 * what may they do): `{ userId, workspaceId, role }`. It is built at the entry
 * point (web action / REST / MCP) — never global, never from the request body —
 * and threaded as the FIRST arg of every service method.
 *
 * `can(role, action)` is a PURE function (no DB) guarding mutations only. Reads
 * are gated by tenant scope (WHERE workspace_id = ctx.workspaceId), not `can()`.
 */
import type { WorkspaceRole } from '@/lib/domain';

/** RBAC role inside a workspace (mirrors WORKSPACE_ROLE). */
export type Role = WorkspaceRole;

/** Immutable security context for one request. */
export interface Ctx {
  /** Real user id — from session or api_key. Never null (agents are users too). */
  readonly userId: string;
  /** The tenant being operated on. Every query filters by this. */
  readonly workspaceId: string;
  /** The caller's role in that workspace. Gates mutations via can(). */
  readonly role: Role;
}

/**
 * Mutations + admin operations gated by `can()`. Named `resource:verb`.
 * Reads are intentionally NOT actions — read permission is tenant membership.
 */
export type Action =
  | 'workspace:update'
  | 'workspace:delete'
  | 'workspace:manage_plan'
  | 'member:invite'
  | 'member:update_role'
  | 'member:remove'
  | 'billing:manage'
  | 'project:create'
  | 'project:update'
  | 'project:archive'
  | 'project:delete'
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'task:assign'
  | 'milestone:create'
  | 'milestone:update'
  | 'module:create'
  | 'module:update'
  | 'comment:create'
  | 'comment:delete'
  | 'apikey:create'
  | 'apikey:revoke';

/**
 * Deny-by-default policy: list only what each role MAY do; '*' = everything.
 * Source of truth = authorization-design.md §5 (the permission matrix).
 */
const POLICY: Record<Role, ReadonlySet<Action | '*'>> = {
  owner: new Set<Action | '*'>(['*']),
  admin: new Set<Action | '*'>([
    'workspace:update',
    'member:invite',
    'member:update_role',
    'member:remove',
    'project:create',
    'project:update',
    'project:archive',
    'project:delete',
    'task:create',
    'task:update',
    'task:delete',
    'task:assign',
    'milestone:create',
    'milestone:update',
    'module:create',
    'module:update',
    'comment:create',
    'comment:delete',
    'apikey:create',
    'apikey:revoke',
  ]),
  member: new Set<Action | '*'>([
    'project:create',
    'project:update',
    'project:archive',
    'task:create',
    'task:update',
    'task:delete',
    'task:assign',
    'milestone:create',
    'milestone:update',
    'module:create',
    'module:update',
    'comment:create',
    'apikey:create',
    'apikey:revoke',
  ]),
  viewer: new Set<Action | '*'>([]), // read-only; reads checked at the scope layer
};

/** Pure RBAC check: may `role` perform `action`? Deny by default. */
export function can(role: Role, action: Action): boolean {
  const allowed = POLICY[role];
  return allowed.has('*') || allowed.has(action);
}
