import { apiKeyService } from '@/server/services';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { SettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const [{ active: workspace }, apiKeys] = await Promise.all([
    resolveActiveWorkspace(),
    apiKeyService.list(),
  ]);
  const initialSection = section === 'general' || section === 'appearance' ? section : 'api';
  return <SettingsScreen workspace={workspace} apiKeys={apiKeys} initialSection={initialSection} />;
}
