import type { Metadata } from 'next';
import { projectService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import { withFreshSession } from '@/server/auth/rsc-session';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { AllProjectsScreen } from '@/components/app/all-projects';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'All projects' };

export default async function AllProjectsPage() {
  return withFreshSession(async () => {
    const userId = await requireSession();
    const { active, isDefault } = await resolveActiveWorkspace(userId);
    const projects = await projectService.list({
      workspaceId: active?.id ?? null,
      includeNullWorkspace: isDefault,
      includeArchived: true,
    });
    return <AllProjectsScreen projects={projects} />;
  });
}
