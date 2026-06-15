/**
 * UI font registry — the single source of truth for the in-app font picker
 * (App Settings → Appearance) and the boot-time applier.
 *
 * Every option is Vietnamese-complete (Latin + Latin-Extended + Vietnamese), so
 * accented vowels (ồ ỗ ấ ề ụ ữ) always render from one face with no mid-word
 * fallback. The font files are loaded with `next/font/google` in the root
 * layout; each `stack` therefore references the generated CSS variable rather
 * than a literal family name (the literal name would silently fall back, since
 * next/font ships an obfuscated family).
 */

export interface UiFontOption {
  /** Stored value in localStorage and the picker key. */
  id: string;
  /** Display name (System is shown as "System UI"). */
  label: string;
  /** CSS `font-family` stack assigned to `--font-ui`. */
  stack: string;
  /** Optional badge, e.g. "Default". */
  tag?: string;
  /** One-line descriptor under the sample. */
  note: string;
}

export const UI_FONT_DEFAULT = 'Hanken Grotesk';
export const UI_FONT_STORAGE_KEY = 'iw-ui-font';

export const UI_FONTS: readonly UiFontOption[] = [
  {
    id: 'Hanken Grotesk',
    label: 'Hanken Grotesk',
    stack: 'var(--font-hanken), ui-sans-serif, system-ui, sans-serif',
    tag: 'Default',
    note: 'Neutral grotesque · crisp, modern',
  },
  {
    id: 'Be Vietnam Pro',
    label: 'Be Vietnam Pro',
    stack: 'var(--font-be-vietnam-pro), ui-sans-serif, system-ui, sans-serif',
    note: 'Made for Vietnamese · friendly, calm',
  },
  {
    id: 'Plus Jakarta Sans',
    label: 'Plus Jakarta Sans',
    stack: 'var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif',
    note: 'Geometric · modern',
  },
  {
    id: 'System',
    label: 'System UI',
    stack: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    note: 'Your operating system default',
  },
];

/** Map of font id → CSS stack, used by the picker and the boot applier. */
export const FONT_STACK: Record<string, string> = Object.fromEntries(
  UI_FONTS.map((f) => [f.id, f.stack]),
);

/** Resolve a stored id to its stack, falling back to the default. */
export function fontStackFor(id: string | null | undefined): string {
  return (id && FONT_STACK[id]) || FONT_STACK[UI_FONT_DEFAULT];
}
