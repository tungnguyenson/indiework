'use server';

import { revalidatePath } from 'next/cache';
import { taskService, commentService, attachmentService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import type { CreateTaskInput, UpdateTaskInput } from '@/server/validators/task';
import type { CreateAttachmentInput } from '@/server/validators/attachment';
import { MAX_ATTACHMENT_BYTES, humanAttachmentSize } from '@/server/attachment-limits';
import { badRequest } from '@/server/services/errors';

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

// ---- scoped (no-revalidate) variants for return-row reconcile (PP-B4) ----
// A pure single-field edit shown on the *same* surface doesn't need a full
// `revalidatePath('/app','layout')` re-read: the client commits the returned
// row into its task mirror directly (see lib/use-reconciled-tasks). This skips
// re-running loadShell + loadProject per edit (the §4 refetch cost) and drains
// the action queue faster (§2). Only for edits the shell/other surfaces do NOT
// depend on — assign-to-project, creates, deletes still use the revalidating
// variants above so the sidebar badge/counts stay correct.

export async function updateTaskScoped(id: string, patch: UpdateTaskInput) {
  await requireSession();
  return taskService.update(id, patch);
}

export async function toggleTaskDoneScoped(id: string) {
  await requireSession();
  return taskService.toggleDone(id);
}

export async function bulkUpdateTasksScoped(ids: string[], patch: UpdateTaskInput) {
  await requireSession();
  return Promise.all(ids.map((id) => taskService.update(id, patch)));
}

export async function addSubtask(parentId: string, title: string) {
  const userId = await requireSession();
  const task = await taskService.addSubtask(parentId, title, undefined, userId);
  refresh();
  return task;
}

/** Detach a sub-task into a standalone task (keeps its ref, attributes, comments). */
export async function convertSubtaskToTask(id: string) {
  await requireSession();
  const task = await taskService.convertToTask(id);
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

// ---- attachments ----
export async function addAttachment(input: CreateAttachmentInput) {
  await requireSession();
  const att = await attachmentService.add(input);
  refresh();
  return att;
}

export async function uploadAttachment(taskId: string, formData: FormData) {
  await requireSession();
  const file = formData.get('file');
  if (!(file instanceof File)) throw badRequest('file is required');
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw badRequest(`File exceeds the ${humanAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const att = await attachmentService.upload({
    taskId,
    name: file.name,
    bytes,
    contentType: file.type || 'application/octet-stream',
  });
  refresh();
  return att;
}

export async function removeAttachment(id: string) {
  await requireSession();
  await attachmentService.remove(id);
  refresh();
}
