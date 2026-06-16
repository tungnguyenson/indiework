'use server';

import { revalidatePath } from 'next/cache';
import { projectService } from '@/server/services';
import type { CreateProjectInput, UpdateProjectInput } from '@/server/validators/project';

function refresh() {
  revalidatePath('/app', 'layout');
}

export async function createProject(input: CreateProjectInput) {
  const project = await projectService.create(input);
  refresh();
  return project;
}

export async function updateProject(id: string, patch: UpdateProjectInput) {
  const project = await projectService.update(id, patch);
  refresh();
  return project;
}

export async function setProjectStatusNote(id: string, note: string) {
  const project = await projectService.setStatusNote(id, { note });
  refresh();
  return project;
}

export async function archiveProject(id: string) {
  await projectService.archive(id);
  refresh();
}

export async function unarchiveProject(id: string) {
  await projectService.unarchive(id);
  refresh();
}
