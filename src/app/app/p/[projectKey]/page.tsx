import { notFound } from 'next/navigation';
import { ServiceError } from '@/server/services';
import { loadProject } from '@/server/load';
import { ProjectView } from '@/components/app/task-list';

export const dynamic = 'force-dynamic';

export default async function ProjectViewPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  try {
    const { project, modules, milestones, tasks } = await loadProject(projectKey);
    return <ProjectView project={project} modules={modules} milestones={milestones} tasks={tasks} />;
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'not_found') notFound();
    throw e;
  }
}
