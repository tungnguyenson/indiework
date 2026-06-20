import 'server-only';
import { env } from '@/server/env';
import { createMemoryStorage } from './memory';
import { createR2Storage } from './r2';
import type { ObjectStorage } from './types';
import { badRequest } from '@/server/services/errors';

export type { ObjectStorage } from './types';

let storage: ObjectStorage | null = null;

export function isObjectStorageConfigured(): boolean {
  return env.R2_CONFIGURED;
}

export function getObjectStorage(): ObjectStorage {
  if (storage) return storage;
  if (env.R2_CONFIGURED) {
    storage = createR2Storage();
  } else if (env.NODE_ENV !== 'production') {
    storage = createMemoryStorage();
  } else {
    throw badRequest('Attachment storage is not configured (set R2_* environment variables)');
  }
  return storage;
}

/** Test-only: reset the singleton between cases. */
export function resetObjectStorageForTests(): void {
  storage = null;
}
