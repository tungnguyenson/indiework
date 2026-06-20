/** Max attachment size (25 MiB). Enforced on every upload boundary. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Strip path segments from a client-provided filename; keep display name only. */
export function sanitizeAttachmentName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() ?? '';
  const safe = base.slice(0, 255);
  return safe || 'file';
}

export function humanAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}
