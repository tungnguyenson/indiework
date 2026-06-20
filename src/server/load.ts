/**
 * RSC data loaders — plain async functions called directly from server
 * components (layouts/pages). Not server actions; they only read.
 */
import {
  projectService,
  moduleService,
  milestoneService,
  taskService,
} from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import { resolveActiveWorkspace } from '@/server/active-workspace';
import { assembleTaskDetail, type TaskDetail } from '@/server/task-detail';

export async function loadShell() {
  const userId = await requireSession();
  const { workspaces, active, isDefault } = await resolveActiveWorkspace(userId);
  const [projects, inbox] = await Promise.all([
    projectService.list({ workspaceId: active?.id ?? null, includeNullWorkspace: isDefault }),
    taskService.listInbox(),
  ]);
  return {
    workspaces,
    activeWorkspace: active,
    projects,
    inboxCount: inbox.length,
  };
}
export type ShellData = Awaited<ReturnType<typeof loadShell>>;

/** Everything a project's screens need: project, its modules, milestones, tasks. */
export async function loadProject(projectKey: string) {
  const project = await projectService.getByKey(projectKey);
  const [modules, milestones, tasks] = await Promise.all([
    moduleService.list(project.id),
    milestoneService.list(project.id),
    taskService.list({ projectId: project.id }),
  ]);
  return { project, modules, milestones, tasks };
}
export type ProjectData = Awaited<ReturnType<typeof loadProject>>;

/** SSR-seed for the standalone task page — resolves a task's full detail by ref. */
export async function loadTaskDetail(ref: string): Promise<TaskDetail> {
  return assembleTaskDetail(await taskService.getByRef(ref));
}
