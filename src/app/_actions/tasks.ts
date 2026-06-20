'use server';

import { revalidatePath } from 'next/cache';
import { taskService, commentService, attachmentService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import type { CreateTaskInput, UpdateTaskInput } from '@/server/validators/task';
import type { CreateAttachmentInput } from '@/server/validators/attachment';

function refresh() {
  revalidatePath('/app', 'layout');
}

export async function createTask(input: CreateTaskInput) {
  const userId = await requireSession();
  const task = await taskService.create(input, userId);
  refresh();
  return task;
}

export async function updateTask(id: string, patch: UpdateTaskInput) {
  await requireSession();
  const task = await taskService.update(id, patch);
  refresh();
  return task;
}

export async function toggleTaskDone(id: string) {
  await requireSession();
  const task = await taskService.toggleDone(id);
  refresh();
  return task;
}

export async function addSubtask(parentId: string, title: string) {
  const userId = await requireSession();
  const task = await taskService.addSubtask(parentId, title, undefined, userId);
  refresh();
  return task;
}

export async function setTaskStatusNote(id: string, note: string) {
  await requireSession();
  const task = await taskService.setStatusNote(id, { note });
  refresh();
  return task;
}

export async function assignTaskToProject(id: string, projectId: string) {
  await requireSession();
  const task = await taskService.assignToProject(id, projectId);
  refresh();
  return task;
}

export async function deleteTask(id: string) {
  await requireSession();
  await taskService.delete(id);
  refresh();
}

export async function reorderTasks(ids: string[]) {
  await requireSession();
  await taskService.reorder(ids);
  refresh();
}

export async function bulkUpdateTasks(ids: string[], patch: UpdateTaskInput) {
  await requireSession();
  await Promise.all(ids.map((id) => taskService.update(id, patch)));
  refresh();
}

export async function bulkDeleteTasks(ids: string[]) {
  await requireSession();
  await Promise.all(ids.map((id) => taskService.delete(id)));
  refresh();
}

export async function addTaskComment(taskId: string, body: string) {
  const userId = await requireSession();
  const comment = await commentService.add({ taskId, body }, 'web', userId);
  refresh();
  return comment;
}

export async function editTaskComment(commentId: string, body: string) {
  await requireSession();
  const comment = await commentService.update({ id: commentId, body });
  refresh();
  return comment;
}

// ---- attachments (metadata only; file storage is deferred — see Phase 7) ----
export async function addAttachment(input: CreateAttachmentInput) {
  await requireSession();
  const att = await attachmentService.add(input);
  refresh();
  return att;
}

export async function removeAttachment(id: string) {
  await requireSession();
  await attachmentService.remove(id);
  refresh();
}
