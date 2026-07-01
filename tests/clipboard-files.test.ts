import { describe, test, expect } from 'vitest';
import { filesFromClipboard, withPasteName } from '@/lib/clipboard-files';

function pngFile(name = 'image.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

describe('filesFromClipboard', () => {
  test('reads blobs from the files list', () => {
    const f = pngFile();
    const out = filesFromClipboard({ files: [f] });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(f);
  });

  test('falls back to items of kind "file" when files is empty', () => {
    const f = pngFile();
    const out = filesFromClipboard({
      files: [],
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => f },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(f);
  });

  test('returns empty for a text-only clipboard', () => {
    expect(filesFromClipboard({ items: [{ kind: 'string', getAsFile: () => null }] })).toEqual([]);
    expect(filesFromClipboard({ files: [] })).toEqual([]);
    expect(filesFromClipboard(null)).toEqual([]);
    expect(filesFromClipboard(undefined)).toEqual([]);
  });

  test('prefers files over items so a blob is never counted twice', () => {
    const f = pngFile();
    const out = filesFromClipboard({
      files: [f],
      items: [{ kind: 'file', getAsFile: () => pngFile('dup.png') }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(f);
  });
});

describe('withPasteName', () => {
  test('keeps an existing filename untouched', () => {
    const f = pngFile('screenshot.png');
    expect(withPasteName(f)).toBe(f);
  });

  test('names a nameless image from its mime type', () => {
    const f = new File([new Uint8Array([1])], '', { type: 'image/png' });
    expect(withPasteName(f).name).toBe('pasted-image.png');
  });

  test('maps image/jpeg to a .jpg name', () => {
    const f = new File([new Uint8Array([1])], '', { type: 'image/jpeg' });
    expect(withPasteName(f).name).toBe('pasted-image.jpg');
  });

  test('names a nameless non-image file', () => {
    const f = new File([new Uint8Array([1])], '', { type: 'application/pdf' });
    expect(withPasteName(f).name).toBe('pasted-file.pdf');
  });

  test('falls back to a bare base name when mime has no subtype', () => {
    const f = new File([new Uint8Array([1])], '', { type: '' });
    expect(withPasteName(f).name).toBe('pasted-file');
  });
});
