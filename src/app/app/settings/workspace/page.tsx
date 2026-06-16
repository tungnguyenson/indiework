import type { Metadata } from 'next';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { WorkspaceSettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Workspace settings' };

export default async function WorkspaceSettingsPage() {
  const { active } = await resolveActiveWorkspace();
  return <WorkspaceSettingsScreen workspace={active} />;
}
