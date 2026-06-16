import { resolveActiveWorkspace } from '@/server/active-workspace';
import { WorkspaceSettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage() {
  const { active } = await resolveActiveWorkspace();
  return <WorkspaceSettingsScreen workspace={active} />;
}
