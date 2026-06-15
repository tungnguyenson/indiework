import { apiKeyService } from '@/server/services';
import { SettingsScreen } from '@/components/app/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const apiKeys = await apiKeyService.list();
  const initialSection = section === 'api' ? 'api' : 'appearance';
  return <SettingsScreen apiKeys={apiKeys} initialSection={initialSection} />;
}
