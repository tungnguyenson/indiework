import { projectService } from '@/server/services';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { AllProjectsScreen } from '@/components/app/all-projects';

export const dynamic = 'force-dynamic';

export default async function AllProjectsPage() {
  const { active, isDefault } = await resolveActiveWorkspace();
  const projects = await projectService.list({
    workspaceId: active?.id ?? null,
    includeNullWorkspace: isDefault,
    includeArchived: true,
  });
  return <AllProjectsScreen projects={projects} />;
}
