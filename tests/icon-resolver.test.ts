import { describe, test, expect } from 'vitest';
import { isEmojiValue } from '@/components/ui/icons';
import { MODULE_ICONS } from '@/lib/domain';
import { createModuleSchema } from '@/server/validators/module';
import { dynamicIconImports, iconNames } from 'lucide-react/dynamic';

/**
 * The unified icon picker stores a single string — an emoji glyph or a Lucide
 * key — and the renderer infers which (no discriminator column). That only
 * holds if the two value-spaces never overlap. These tests pin that invariant.
 */
describe('isEmojiValue', () => {
  test('treats emoji / glyphs as emoji', () => {
    for (const e of ['🚀', '🪴', '◈', '🛠️', '✨', '🔐', '🧭', '🌿', '⚙️', '❤️']) {
      expect(isEmojiValue(e)).toBe(true);
    }
  });

  test('treats Lucide keys (facade aliases + canonical kebab names) as NOT emoji', () => {
    for (const k of [
      'cube', 'bolt', 'sparkle', // legacy facade aliases
      'box', 'zap', 'sparkles', 'columns-3', 'sliders-horizontal', 'a-arrow-down', // canonical
    ]) {
      expect(isEmojiValue(k)).toBe(false);
    }
  });

  test('every curated MODULE_ICONS key resolves as a Lucide value, never emoji', () => {
    for (const k of MODULE_ICONS) expect(isEmojiValue(k)).toBe(false);
  });

  test('empty / null / undefined are not emoji (renderer shows a colour dot)', () => {
    expect(isEmojiValue('')).toBe(false);
    expect(isEmojiValue(null)).toBe(false);
    expect(isEmojiValue(undefined)).toBe(false);
  });
});

describe('module icon validator (loosened from enum → free string)', () => {
  const base = { projectId: '00000000-0000-0000-0000-000000000000', name: 'Module' };

  test('accepts a Lucide name', () => {
    expect(createModuleSchema.parse({ ...base, icon: 'rocket' }).icon).toBe('rocket');
  });

  test('accepts an emoji glyph', () => {
    expect(createModuleSchema.parse({ ...base, icon: '🚀' }).icon).toBe('🚀');
  });

  test('accepts null (no icon)', () => {
    expect(createModuleSchema.parse({ ...base, icon: null }).icon).toBeNull();
  });

  test('rejects an over-long value', () => {
    expect(() => createModuleSchema.parse({ ...base, icon: 'x'.repeat(65) })).toThrow();
  });
});

/**
 * The "1,900+ searchable icons" promise rests on the Lucide dynamic loader:
 * the picker searches `iconNames`, and the renderer lazily resolves each via a
 * `() => import('./icons/<name>.mjs')` thunk. This exercises that mechanism end
 * to end — the names the search surfaces actually resolve to real components.
 */
describe('Lucide dynamic loader (picker search backbone)', () => {
  test('iconNames covers the names the search relies on', () => {
    expect(iconNames.length).toBeGreaterThan(1000);
    for (const n of ['rocket', 'box', 'zap', 'sparkles']) expect(iconNames).toContain(n);
  });

  test('a dynamic thunk resolves to a real icon component at runtime', async () => {
    const mod = await dynamicIconImports['rocket']();
    expect(mod).toBeTruthy();
    expect(mod.default).toBeTruthy(); // the lazily-loaded forwardRef component
  });
});
