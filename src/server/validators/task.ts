import { z } from 'zod';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/domain';

/** Create a task. No project → lands in the Inbox. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(500),
  projectId: z.uuid().nullish(),
  parentId: z.uuid().nullish(), // set → this is a one-level sub-task
  moduleId: z.uuid().nullish(),
  milestoneId: z.uuid().nullish(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  description: z.string().nullish(),
  statusNote: z.string().nullish(),
  dueDate: z.coerce.date().nullish(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Patch a task. Only provided keys change; `null` clears a nullable field. */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  moduleId: z.uuid().nullish(),
  milestoneId: z.uuid().nullish(),
  description: z.string().nullish(),
  statusNote: z.string().nullish(),
  dueDate: z.coerce.date().nullish(),
  position: z.number().int().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Filter for listing tasks. */
export const listTasksSchema = z.object({
  projectId: z.uuid().optional(),
  inbox: z.coerce.boolean().optional(),
  status: z.array(z.enum(TASK_STATUS)).optional(),
  priority: z.array(z.enum(TASK_PRIORITY)).optional(),
  moduleId: z.uuid().optional(),
  milestoneId: z.uuid().optional(),
  hideDone: z.coerce.boolean().optional(),
});
export type ListTasksInput = z.infer<typeof listTasksSchema>;

export const setStatusNoteSchema = z.object({
  note: z.string().max(2000),
});
