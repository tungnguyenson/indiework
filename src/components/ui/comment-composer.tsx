'use client';

import dynamic from 'next/dynamic';
import type { CommentComposerProps } from './comment-composer.impl';

/**
 * Comment composer (Tiptap), lazy-loaded with `ssr: false` so ProseMirror stays
 * out of the main bundle and only loads when a task's activity surface mounts.
 */
export const CommentComposer = dynamic(
  () => import('./comment-composer.impl').then((m) => m.CommentComposerImpl),
  { ssr: false, loading: () => <div className="comment-box comment-box--loading" aria-busy="true" /> },
);

export type { CommentComposerProps };
