'use server';

import { revalidatePath } from 'next/cache';
import { apiKeyService } from '@/server/services';
import { requireSession } from '@/server/auth/require-session';
import type { ApiKeyScope } from '@/lib/domain';

export async function createApiKey(name: string, scope: ApiKeyScope) {
  await requireSession();
  const result = await apiKeyService.create({ name, scope });
  revalidatePath('/app/settings');
  return result; // { key, secret } — secret shown once
}

export async function revokeApiKey(id: string) {
  await requireSession();
  await apiKeyService.revoke(id);
  revalidatePath('/app/settings');
}
