'use server';

/** Read-only actions callable from client components (detail panel, palette). */
import { taskService, projectService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import { assembleTaskDetail } from '@/server/task-detail';

export async function getTaskDetail(id: string) {
  await requireSession();
  return assembleTaskDetail(await taskService.getById(id));
}

/** Resolve a detail panel from a public ref ("IW-11") — the path-URL scheme. */
export async function getTaskDetailByRef(ref: string) {
  await requireSession();
  return assembleTaskDetail(await taskService.getByRef(ref));
}
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

export async function loadSearchIndex() {
  await requireSession();
  const [projects, tasks] = await Promise.all([
    projectService.list(),
    taskService.list({}),
  ]);
  return {
    projects: projects.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      emoji: p.emoji,
      shortDesc: p.shortDesc,
    })),
    tasks: tasks
      .filter((t) => !t.parentId) // search operates on root tasks only
      .map((t) => ({
        id: t.id,
        title: t.title,
        ref: t.ref,
        projectId: t.projectId,
        done: t.done,
      })),
  };
}
export type SearchIndex = Awaited<ReturnType<typeof loadSearchIndex>>;
