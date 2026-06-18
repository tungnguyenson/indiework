'use server';

import { revalidatePath } from 'next/cache';
import { projectService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import type { CreateProjectInput, UpdateProjectInput } from '@/server/validators/project';

function refresh() {
  revalidatePath('/app', 'layout');
}

export async function createProject(input: CreateProjectInput) {
  await requireSession();
  const project = await projectService.create(input);
  refresh();
  return project;
}

export async function updateProject(id: string, patch: UpdateProjectInput) {
  await requireSession();
  const project = await projectService.update(id, patch);
  refresh();
  return project;
}

export async function setProjectStatusNote(id: string, note: string) {
  await requireSession();
  const project = await projectService.setStatusNote(id, { note });
  refresh();
  return project;
}

export async function archiveProject(id: string) {
  await requireSession();
  await projectService.archive(id);
  refresh();
}

export async function unarchiveProject(id: string) {
  await requireSession();
  await projectService.unarchive(id);
  refresh();
}
