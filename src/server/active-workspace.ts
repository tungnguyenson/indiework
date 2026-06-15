/**
 * Active-workspace resolution. The single-user app tracks which workspace is
 * "active" via the `iw-workspace` cookie. Server components/loaders read it
 * here; the `setActiveWorkspace` action (see _actions/workspace.ts) writes it.
 */
import { cookies } from 'next/headers';
import { workspaceService } from '@/server/services';

export const WORKSPACE_COOKIE = 'iw-workspace';

type Workspace = Awaited<ReturnType<typeof workspaceService.list>>[number];

export interface ActiveWorkspace {
  workspaces: Workspace[];
  active: Workspace | null;
  /** True when the active workspace is the default (first-created) one. */
  isDefault: boolean;
}

/**
 * Resolve the active workspace from the `iw-workspace` cookie, falling back to
 * the first (default) workspace when the cookie is missing or stale.
 */
export async function resolveActiveWorkspace(): Promise<ActiveWorkspace> {
  const workspaces = await workspaceService.list();
  if (workspaces.length === 0) return { workspaces, active: null, isDefault: true };
  const id = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = workspaces.find((w) => w.id === id) ?? workspaces[0];
  return { workspaces, active, isDefault: active.id === workspaces[0].id };
}
