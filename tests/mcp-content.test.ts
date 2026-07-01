import { describe, test, expect } from 'vitest';
import {
  blocks,
  isMcpBlocks,
  serializeToolResult,
  imageMime,
  attachmentView,
  attachmentBlocks,
  type AttachmentMeta,
} from '@/server/mcp-content';

const imageMeta: AttachmentMeta = {
  id: 'att-1',
  name: '2026-07-01_11-46-30.png',
  type: 'image',
  size: '10.6 KB',
  ext: 'png',
  path: 'obj/att-1',
};

describe('serializeToolResult', () => {
  test('JSON-stringifies plain results into a single text block', () => {
    const out = serializeToolResult({ ref: 'IW-103', attachmentCount: 1 });
    expect(out.content).toHaveLength(1);
    expect(out.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ ref: 'IW-103', attachmentCount: 1 }, null, 2),
    });
  });

  test('passes McpBlocks through verbatim (image block reaches the client)', () => {
    const wrapped = blocks([
      { type: 'text', text: 'label' },
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ]);
    expect(isMcpBlocks(wrapped)).toBe(true);
    const out = serializeToolResult(wrapped);
    expect(out.content).toEqual([
      { type: 'text', text: 'label' },
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ]);
  });

  test('a plain object carrying a `content` key is NOT treated as blocks', () => {
    const out = serializeToolResult({ content: 'just a field' });
    expect(out.content).toHaveLength(1);
    expect(out.content[0].type).toBe('text');
  });
});

describe('imageMime', () => {
  test('passes through a real image/* content-type', () => {
    expect(imageMime('image/jpeg', 'png')).toBe('image/jpeg');
  });

  test('falls back to ext when content-type is generic or missing', () => {
    expect(imageMime('application/octet-stream', 'png')).toBe('image/png');
    expect(imageMime(null, 'jpg')).toBe('image/jpeg');
    expect(imageMime(undefined, '.WEBP')).toBe('image/webp');
  });

  test('returns null for an unknown/non-image ext', () => {
    expect(imageMime('application/octet-stream', 'pdf')).toBeNull();
    expect(imageMime(null, null)).toBeNull();
  });
});

describe('attachmentView', () => {
  test('marks an image with a stored path previewable', () => {
    expect(attachmentView(imageMeta)).toEqual({
      id: 'att-1',
      name: '2026-07-01_11-46-30.png',
      type: 'image',
      size: '10.6 KB',
      ext: 'png',
      previewable: true,
    });
  });

  test('image without a path is not previewable', () => {
    expect(attachmentView({ ...imageMeta, path: null }).previewable).toBe(false);
  });

  test('non-image file is not previewable', () => {
    expect(attachmentView({ ...imageMeta, type: 'file', ext: 'pdf' }).previewable).toBe(false);
  });
});

describe('attachmentBlocks', () => {
  test('an image yields a text label + an image content block (base64)', () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    const out = attachmentBlocks(imageMeta, { body, contentType: 'image/png' });
    expect(out.content).toEqual([
      { type: 'text', text: '2026-07-01_11-46-30.png · 10.6 KB · image' },
      { type: 'image', data: Buffer.from(body).toString('base64'), mimeType: 'image/png' },
    ]);
  });

  test('derives image/* from ext when storage returns a generic content-type', () => {
    const out = attachmentBlocks(imageMeta, {
      body: new Uint8Array([0]),
      contentType: 'application/octet-stream',
    });
    const img = out.content.find((b) => b.type === 'image');
    expect(img).toMatchObject({ type: 'image', mimeType: 'image/png' });
  });

  test('non-image returns a single explanatory text block, no image', () => {
    const out = attachmentBlocks(
      { ...imageMeta, type: 'file', ext: 'pdf', name: 'doc.pdf' },
      null,
    );
    expect(out.content).toHaveLength(1);
    expect(out.content[0].type).toBe('text');
    expect(out.content.some((b) => b.type === 'image')).toBe(false);
  });

  test('image with no stored bytes (url-only) is not inlined', () => {
    const out = attachmentBlocks({ ...imageMeta, path: null }, null);
    expect(out.content).toHaveLength(1);
    expect(out.content[0].type).toBe('text');
  });

  test('an image too large to inline falls back to metadata, no image block', () => {
    const out = attachmentBlocks(
      { ...imageMeta, size: '2.0 MB' },
      { body: new Uint8Array(2 * 1024 * 1024), contentType: 'image/png' },
    );
    expect(out.content).toHaveLength(1);
    expect(out.content[0].type).toBe('text');
    expect(out.content.some((b) => b.type === 'image')).toBe(false);
  });

  test('image whose mime cannot be resolved is not inlined', () => {
    const out = attachmentBlocks(
      { ...imageMeta, ext: 'heic' },
      { body: new Uint8Array([1]), contentType: 'application/octet-stream' },
    );
    expect(out.content.some((b) => b.type === 'image')).toBe(false);
  });
});
