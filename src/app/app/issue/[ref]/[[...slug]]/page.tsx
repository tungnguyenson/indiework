import { notFound } from 'next/navigation';
import { ServiceError } from '@/server/services';
import { parseRef } from '@/lib/domain';
import { loadProject } from '@/server/load';
import { ProjectView } from '@/components/app/task-list';

export const dynamic = 'force-dynamic';

/**
 * Task-detail URL `/app/issue/IW-11/<slug>`. The ref encodes the project, so we
 * derive the project from it and render the same project view behind — the panel
 * (driven by AppShell from the pathname ref) overlays it. The `slug` is
 * decorative and ignored; the task resolves by ref.
 */
export default async function IssuePage({
  params,
}: {
  params: Promise<{ ref: string; slug?: string[] }>;
}) {
  const { ref } = await params;
  const parsed = parseRef(ref);
  if (!parsed) notFound();
  try {
    const { project, modules, milestones, tasks } = await loadProject(parsed.key);
    return <ProjectView project={project} modules={modules} milestones={milestones} tasks={tasks} />;
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'not_found') notFound();
    throw e;
  }
}
