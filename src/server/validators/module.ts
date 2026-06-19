import { z } from 'zod';
import { MODULE_STATE } from '@/lib/domain';

// `icon` holds either a Lucide key (curated `MODULE_ICONS` or any canonical
// Lucide name) or an emoji glyph — the renderer infers which (see isEmojiValue).
const iconSchema = z.string().max(64).nullish();

export const createModuleSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, 'name is required').max(120),
  color: z.string().max(32).nullish(),
  icon: iconSchema,
  state: z.enum(MODULE_STATE).optional(),
  description: z.string().max(280).nullish(),
  position: z.number().int().optional(),
});
export type CreateModuleInput = z.infer<typeof createModuleSchema>;

export const updateModuleSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().max(32).nullish(),
  icon: iconSchema,
  state: z.enum(MODULE_STATE).optional(),
  description: z.string().max(280).nullish(),
  position: z.number().int().optional(),
});
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
