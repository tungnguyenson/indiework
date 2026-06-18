'use server';

import { revalidatePath } from 'next/cache';
import { moduleService, milestoneService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import type { CreateModuleInput, UpdateModuleInput } from '@/server/validators/module';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '@/server/validators/milestone';
import type { MilestoneStatus } from '@/lib/domain';

function refresh() {
  revalidatePath('/app', 'layout');
}

// ---- modules ----
export async function createModule(input: CreateModuleInput) {
  await requireSession();
  const m = await moduleService.create(input);
  refresh();
  return m;
}
export async function updateModule(id: string, patch: UpdateModuleInput) {
  await requireSession();
  const m = await moduleService.update(id, patch);
  refresh();
  return m;
}
export async function archiveModule(id: string) {
  await requireSession();
  await moduleService.archive(id);
  refresh();
}
export async function reorderModules(ids: string[]) {
  await requireSession();
  await moduleService.reorder({ ids });
  refresh();
}

// ---- milestones ----
export async function createMilestone(input: CreateMilestoneInput) {
  await requireSession();
  const m = await milestoneService.create(input);
  refresh();
  return m;
}
export async function updateMilestone(id: string, patch: UpdateMilestoneInput) {
  await requireSession();
  const m = await milestoneService.update(id, patch);
  refresh();
  return m;
}
export async function setMilestoneStatus(id: string, status: MilestoneStatus) {
  await requireSession();
  const m = await milestoneService.setStatus(id, status);
  refresh();
  return m;
}
export async function deleteMilestone(id: string) {
  await requireSession();
  await milestoneService.remove(id);
  refresh();
}
export async function reorderMilestones(ids: string[]) {
  await requireSession();
  await milestoneService.reorder({ ids });
  refresh();
}
