/**
 * Pull file blobs out of a clipboard paste (or drag-drop) payload so they can be
 * uploaded as attachments. A pasted screenshot surfaces as an `image/*` File;
 * some browsers expose it only via `items` (kind 'file'), others via `files` —
 * we read whichever is populated. Duck-typed on the minimal shape of
 * `DataTransfer` so it stays testable in Node without a DOM.
 */

export interface ClipboardItemLike {
  readonly kind: string; // 'file' | 'string'
  getAsFile(): File | null;
}

export interface ClipboardDataLike {
  readonly files?: ArrayLike<File> | null;
  readonly items?: ArrayLike<ClipboardItemLike> | null;
}

/**
 * File blobs carried by a paste/drop payload, in payload order. Empty when the
 * clipboard holds only text — the normal case, where callers let the paste fall
 * through to the focused input/editor instead of intercepting it.
 */
export function filesFromClipboard(data: ClipboardDataLike | null | undefined): File[] {
  if (!data) return [];
  const fromFiles = data.files && data.files.length ? Array.from(data.files) : [];
  if (fromFiles.length) return fromFiles;
  if (!data.items) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out;
}

/**
 * Give a clipboard file a sensible name when the browser supplies none (some
 * emit a nameless blob for pasted images). Named files pass through untouched,
 * so this is a no-op for copied files and most screenshots.
 */
export function withPasteName(file: File): File {
  if (file.name) return file;
  const ext = mimeExtension(file.type);
  const base = file.type.startsWith('image/') ? 'pasted-image' : 'pasted-file';
  const name = ext ? `${base}.${ext}` : base;
  return new File([file], name, { type: file.type });
}

/** Best-effort extension from a MIME type: `image/png` → `png`, `image/jpeg` → `jpg`. */
function mimeExtension(mime: string): string {
  const sub = mime.split('/')[1]?.toLowerCase().replace(/[^a-z0-9].*$/, '') ?? '';
  if (!sub) return '';
  return sub === 'jpeg' ? 'jpg' : sub;
}
