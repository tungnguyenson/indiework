/**
 * Assemble a task's full detail (parent, children, comments, modules,
 * milestones, attachments) from an already-loaded task. Shared by the
 * client-callable read actions in `_actions/queries` and the RSC loader in
 * `load.ts` so the inspector panel and the standalone page agree on shape.
 */
import {
  taskService,
  commentService,
  moduleService,
  milestoneService,
  attachmentService,
  userService,
} from '@/server/services';

export async function assembleTaskDetail(task: Awaited<ReturnType<typeof taskService.getById>>) {
  const id = task.id;
  const [rawComments, modules, milestones, rawChildren, parent, attachments] = await Promise.all([
    commentService.list(id),
    task.projectId ? moduleService.list(task.projectId) : Promise.resolve([]),
    task.projectId ? milestoneService.list(task.projectId) : Promise.resolve([]),
    taskService.listChildren(id),
    task.parentId ? taskService.getById(task.parentId) : Promise.resolve(null),
    attachmentService.list(id),
  ]);

  const authorIds = [
    ...new Set(rawComments.map((c) => c.createdById).filter((v): v is string => !!v)),
  ];
  const authors = await userService.getByIds(authorIds);
  const comments = rawComments.map((c) => ({
    ...c,
    author: c.createdById ? (authors.get(c.createdById) ?? null) : null,
  }));

  // Sub-tasks are first-class tasks: each carries its own ref (KEY-<n>), so the
  // display ref is simply the task's own ref (null only while in the Inbox).
  const displayRef = task.ref;
  const children = rawChildren.map((c) => ({ ...c, displayRef: c.ref }));

  return { task, displayRef, parent, children, comments, modules, milestones, attachments };
}

export type TaskDetail = Awaited<ReturnType<typeof assembleTaskDetail>>;
