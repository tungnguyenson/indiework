'use client';

import dynamic from 'next/dynamic';
import type { MarkdownEditorProps } from './markdown-editor.impl';

/**
 * WYSIWYG markdown editor (Tiptap), lazy-loaded with `ssr: false` so ProseMirror
 * stays out of the main bundle and only loads when a description editor mounts.
 */
export const MarkdownEditor = dynamic(
  () => import('./markdown-editor.impl').then((m) => m.MarkdownEditorImpl),
  { ssr: false, loading: () => <div className="md-render md-wysiwyg" aria-busy="true" /> },
);

export type { MarkdownEditorProps };
