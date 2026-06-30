import type { Metadata } from 'next';
import { requireSession } from '@/server/auth/require-session';
import { withFreshSession } from '@/server/auth/rsc-session';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { WorkspaceSettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Workspace settings' };

export default async function WorkspaceSettingsPage() {
  return withFreshSession(async () => {
    const userId = await requireSession();
    const { active } = await resolveActiveWorkspace(userId);
    return <WorkspaceSettingsScreen workspace={active} />;
  });
}
