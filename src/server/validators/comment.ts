import { z } from 'zod';
import { COMMENT_SOURCE } from '@/lib/domain';

export const addCommentSchema = z.object({
  taskId: z.uuid(),
  body: z.string().trim().min(1, 'body is required').max(10000),
  source: z.enum(COMMENT_SOURCE).optional(),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const updateCommentSchema = z.object({
  id: z.uuid(),
  body: z.string().trim().min(1, 'body is required').max(10000),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
