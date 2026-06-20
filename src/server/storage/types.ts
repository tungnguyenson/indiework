/** Object storage backend for attachment bytes (R2 in prod, memory in tests). */
export interface ObjectStorage {
  /** Stable key for an attachment id — never derived from user filenames. */
  objectKey(attachmentId: string): string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string | null }>;
  delete(key: string): Promise<void>;
}
