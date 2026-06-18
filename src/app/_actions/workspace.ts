'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { workspaceService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import { WORKSPACE_COOKIE } from '@/server/active-workspace';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@/server/validators/workspace';

const ONE_YEAR = 60 * 60 * 24 * 365;

function refresh() {
  revalidatePath('/app', 'layout');
}

async function setWorkspaceCookie(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  });
}

/** Persist which workspace is active (cookie) and re-render the app shell. */
export async function setActiveWorkspace(id: string) {
  await requireSession();
  await setWorkspaceCookie(id);
  refresh();
}

export async function createWorkspace(input: CreateWorkspaceInput) {
  await requireSession();
  const ws = await workspaceService.create(input);
  // Drop the user straight into the new workspace so the switch is visible.
  await setWorkspaceCookie(ws.id);
  refresh();
  return ws;
}

export async function updateWorkspace(id: string, patch: UpdateWorkspaceInput) {
  await requireSession();
  const ws = await workspaceService.update(id, patch);
  refresh();
  return ws;
}
