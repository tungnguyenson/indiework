/**
 * Ctx resolution (IW-37) — build the per-request security context at each entry
 * point and validate the security invariants from authorization-design.md §7:
 *
 *  - workspaceId is NEVER taken from the request body. Web: the membership-
 *    validated active workspace. Bearer: the workspace the api_key is bound to.
 *  - role is looked up server-side from workspace_members (never trusted from
 *    the client).
 *  - a non-member of the resolved workspace ⇒ unauthorized() before any service
 *    runs.
 */
import { requireSession } from '@/server/auth/require-session';
import { resolveBearerPrincipal } from '@/server/auth/token';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { memberService, workspaceService } from '@/server/services';
import { unauthorized } from '@/server/services/errors';
import type { Ctx } from '@/server/auth/ctx';

/**
 * Web (Server Action / RSC loader): session cookie → userId → active workspace
 * (membership-validated) → role. Throws unauthorized when there is no session
 * or the user has no active membership.
 */
export async function ctxFromSession(): Promise<Ctx> {
  const userId = await requireSession();
  const { active } = await resolveActiveWorkspace(userId);
  if (!active) throw unauthorized('No active workspace membership');

  const role = await memberService.roleOf(userId, active.id);
  if (!role) throw unauthorized('Not a member of this workspace');

  return { userId, workspaceId: active.id, role };
}

/**
 * REST / MCP: Bearer token → principal (userId + bound workspace) → role.
 * Falls back to the default workspace when a legacy key carries none. Throws
 * unauthorized when the token is invalid or the user isn't a member.
 */
export async function ctxFromBearer(req: Request): Promise<Ctx> {
  const principal = await resolveBearerPrincipal(req);
  if (!principal) throw unauthorized();

  const workspaceId = principal.workspaceId ?? (await workspaceService.getDefault())?.id ?? null;
  if (!workspaceId) throw unauthorized('No workspace for this token');

  const role = await memberService.roleOf(principal.userId, workspaceId);
  if (!role) throw unauthorized('Token user is not a member of this workspace');

  return { userId: principal.userId, workspaceId, role };
}
