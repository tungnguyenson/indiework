import type { ObjectStorage } from './types';

/** In-process storage for tests and local dev when R2 is not configured. */
export function createMemoryStorage(): ObjectStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();

  return {
    objectKey(attachmentId) {
      return `attachments/${attachmentId}`;
    },

    async put(key, body, contentType) {
      objects.set(key, { body: new Uint8Array(body), contentType });
    },

    async get(key) {
      const row = objects.get(key);
      if (!row) throw new Error(`memory storage: object not found (${key})`);
      return { body: row.body, contentType: row.contentType };
    },

    async delete(key) {
      objects.delete(key);
    },
  };
}
