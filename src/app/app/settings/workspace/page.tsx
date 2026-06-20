import type { Metadata } from 'next';
import { requireSession } from '@/server/auth/require-session';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { WorkspaceSettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Workspace settings' };

export default async function WorkspaceSettingsPage() {
  const userId = await requireSession();
  const { active } = await resolveActiveWorkspace(userId);
  return <WorkspaceSettingsScreen workspace={active} />;
}
