/**
 * MCP content-block helpers for the tool endpoint. Pure (no I/O) so the
 * protocol-facing serialization — especially returning an *image* so a
 * vision-capable client can see an attachment — can be unit-tested without a
 * route/DB/auth harness (mirrors attachment-headers.ts).
 */
// Cap for inlining an image as base64 into a single tool result. Uploads allow
// up to 5 MB, but base64 inflates ~33% and the whole blob lands in the model's
// context — so above this we return metadata instead of a giant image block.
const INLINE_IMAGE_MAX_BYTES = 1024 * 1024;

/** A single MCP content block. Images let a client actually see an attachment. */
export type McpBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

// Most tools return plain data (JSON-stringified into one text block); a few
// need to hand back raw blocks. A tool signals that with this wrapper, which the
// serializer passes through verbatim. The symbol tag avoids colliding with a
// normal result that happens to carry a `content` key.
const MCP_BLOCKS = Symbol('mcpBlocks');
export interface McpBlocks {
  [MCP_BLOCKS]: true;
  content: McpBlock[];
}
export const blocks = (content: McpBlock[]): McpBlocks => ({ [MCP_BLOCKS]: true, content });
export const isMcpBlocks = (v: unknown): v is McpBlocks =>
  typeof v === 'object' && v !== null && (v as Record<PropertyKey, unknown>)[MCP_BLOCKS] === true;

/** Wrap a tool's return value into the MCP `tools/call` result shape. */
export function serializeToolResult(result: unknown): { content: McpBlock[] } {
  if (isMcpBlocks(result)) return { content: result.content };
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// Minimal ext→mime fallback for the image block. `storage.get()` returns the
// content-type captured at upload, but if that's missing/generic we still need a
// real `image/*` type or the client rejects the block.
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};
export function imageMime(contentType: string | undefined | null, ext: string | null): string | null {
  if (contentType && contentType.startsWith('image/')) return contentType;
  const key = (ext ?? '').replace(/^\./, '').toLowerCase();
  return IMAGE_MIME_BY_EXT[key] ?? null;
}

/** Attachment metadata this module reasons about (structural subset of the row). */
export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size: string | null;
  ext: string | null;
  path: string | null;
}

/**
 * Read projection for get_task's `attachments`: enough to identify a file and
 * fetch it via view_attachment. `previewable` flags images with stored bytes.
 */
export function attachmentView(a: AttachmentMeta) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    size: a.size,
    ext: a.ext,
    previewable: a.type === 'image' && !!a.path,
  };
}

/**
 * Build the content blocks for view_attachment. `opened` is the fetched bytes +
 * content-type, or null when there's nothing to render (non-image, or no stored
 * bytes). Images become a text label + an image block; everything else is a
 * single explanatory text block.
 */
export function attachmentBlocks(
  meta: AttachmentMeta,
  opened: { body: Uint8Array; contentType: string | null } | null,
): McpBlocks {
  const label = `${meta.name}${meta.size ? ` · ${meta.size}` : ''} · ${meta.type}`;

  if (meta.type !== 'image' || !meta.path || !opened) {
    const reason =
      meta.type !== 'image'
        ? 'Not an image — download the raw file via the attachments download API.'
        : 'No stored file bytes for this attachment (not server-fetchable).';
    return blocks([{ type: 'text', text: `${label}\n${reason}` }]);
  }

  const mimeType = imageMime(opened.contentType, meta.ext);
  // No real image/* mime, or too large to inline: return metadata rather than
  // emit a block the client may reject or a blob that floods the context.
  if (!mimeType || opened.body.byteLength > INLINE_IMAGE_MAX_BYTES) {
    return blocks([{ type: 'text', text: `${label}\n(image not inlined — ${meta.size ?? 'unknown size'})` }]);
  }

  return blocks([
    { type: 'text', text: label },
    { type: 'image', data: Buffer.from(opened.body).toString('base64'), mimeType },
  ]);
}
