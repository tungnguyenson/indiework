'use server';

/** Read-only actions callable from client components (detail panel, palette). */
import {
  taskService,
  commentService,
  moduleService,
  milestoneService,
  projectService,
  attachmentService,
} from '@/server/services';

export async function getTaskDetail(id: string) {
  const task = await taskService.getById(id);
  const [comments, modules, milestones, rawChildren, parent, attachments] = await Promise.all([
    commentService.list(id),
    task.projectId ? moduleService.list(task.projectId) : Promise.resolve([]),
    task.projectId ? milestoneService.list(task.projectId) : Promise.resolve([]),
    taskService.listChildren(id),
    task.parentId ? taskService.getById(task.parentId) : Promise.resolve(null),
    attachmentService.list(id),
  ]);

  // Sub-tasks are first-class tasks: each carries its own ref (KEY-<n>), so the
  // display ref is simply the task's own ref (null only while in the Inbox).
  const displayRef = task.ref;
  const children = rawChildren.map((c) => ({ ...c, displayRef: c.ref }));

  return { task, displayRef, parent, children, comments, modules, milestones, attachments };
}
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

export async function loadSearchIndex() {
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
