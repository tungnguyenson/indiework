import { redirect } from 'next/navigation';
import { projectService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import { resolveActiveWorkspace } from '@/server/active-workspace';

export const dynamic = 'force-dynamic';

export default async function AppHome() {
  const userId = await requireSession();
  const { active, isDefault } = await resolveActiveWorkspace(userId);
  const projects = await projectService.list({
    workspaceId: active?.id ?? null,
    includeNullWorkspace: isDefault,
  });
  // Empty workspace (e.g. a freshly created one): land on the Inbox rather
  // than a project that belongs to a different workspace.
  if (projects.length === 0) redirect('/app/inbox');
  const target = projects.find((p) => p.pinned) ?? projects[0];
  redirect(`/app/p/${target.key}`);
}
