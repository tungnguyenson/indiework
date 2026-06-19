'use client';

import dynamic from 'next/dynamic';
import type { MarkdownViewProps } from './markdown-view.impl';

/**
 * Read-only markdown view (Tiptap), lazy-loaded with `ssr: false` so ProseMirror
 * stays out of the main bundle and only loads when a task's activity surface
 * mounts (it shares the chunk with the composer, which is always present there).
 */
export const MarkdownView = dynamic(
  () => import('./markdown-view.impl').then((m) => m.MarkdownViewImpl),
  { ssr: false, loading: () => <div className="md-render act-text" aria-busy="true" /> },
);

export type { MarkdownViewProps };
