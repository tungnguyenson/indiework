'use client';

import dynamic from 'next/dynamic';
import type { CommentEditorProps } from './comment-editor.impl';

/**
 * Comment editor (Tiptap), lazy-loaded with `ssr: false` so ProseMirror only
 * loads when a comment is actually put into edit mode — keeping it out of the
 * activity surface's initial paint.
 */
export const CommentEditor = dynamic(
  () => import('./comment-editor.impl').then((m) => m.CommentEditorImpl),
  { ssr: false, loading: () => <div className="comment-box comment-box--loading" aria-busy="true" /> },
);

export type { CommentEditorProps };
