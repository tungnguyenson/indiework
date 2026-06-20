/**
 * Active-workspace resolution. Tracks which workspace is "active" via the
 * `iw-workspace` cookie. Multi-tenant: the candidate set is the user's ACTIVE
 * memberships (never all workspaces), so the active workspace — and thus
 * Ctx.workspaceId — can never point at a tenant the user doesn't belong to.
 */
import { cookies } from 'next/headers';
import { memberService } from '@/server/services';

export const WORKSPACE_COOKIE = 'iw-workspace';

type Membership = Awaited<ReturnType<typeof memberService.listForUser>>[number];
type Workspace = Membership['workspace'];

export interface ActiveWorkspace {
  workspaces: Workspace[];
  active: Workspace | null;
  /** The caller's role in the active workspace (null when not a member). */
  role: Membership['role'] | null;
  /** True when the active workspace is the default (first-joined) one. */
  isDefault: boolean;
}

/**
 * Resolve the active workspace for `userId` from the `iw-workspace` cookie,
 * validated against the user's memberships. Falls back to the first membership
 * when the cookie is missing or points at a workspace the user can't access.
 */
export async function resolveActiveWorkspace(userId: string): Promise<ActiveWorkspace> {
  const memberships = await memberService.listForUser(userId);
  const workspaces = memberships.map((m) => m.workspace);
  if (memberships.length === 0) {
    return { workspaces, active: null, role: null, isDefault: true };
  }
  const id = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const activeMembership = memberships.find((m) => m.workspace.id === id) ?? memberships[0];
  return {
    workspaces,
    active: activeMembership.workspace,
    role: activeMembership.role,
    isDefault: activeMembership.workspace.id === memberships[0].workspace.id,
  };
}
