import type { ReactNode } from 'react';
import { loadShell } from '@/server/load';
import { withFreshSession } from '@/server/auth/rsc-session';
import { AppShell } from '@/components/app/app-shell';
import { FeedbackProvider } from '@/components/ui/toast';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The shell load is the chokepoint every /app route passes through: a
  // signed-but-DB-stale session (e.g. after a demo reset) throws `unauthorized`
  // here. Convert it to a graceful logout instead of a layout-level 500.
  const shell = await withFreshSession(() => loadShell());
  return (
    <FeedbackProvider>
      <AppShell shell={shell}>{children}</AppShell>
    </FeedbackProvider>
  );
}
