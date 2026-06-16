import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServiceError, projectService } from '@/server/services';
import { loadProject } from '@/server/load';
import { ProjectView } from '@/components/app/task-list';

export const dynamic = 'force-dynamic';

// Tab title tracks the project being viewed (e.g. "IndieWorker · IndieWork").
// Falls back to the layout default if the key resolves to nothing.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}): Promise<Metadata> {
  const { projectKey } = await params;
  try {
    const project = await projectService.getByKey(projectKey);
    return { title: project.name };
  } catch {
    return {};
  }
}

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
