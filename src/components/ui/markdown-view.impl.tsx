'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { markdownExtensions, getMarkdown } from './markdown-core';

export interface MarkdownViewProps {
  /** Markdown source to render read-only. */
  value: string;
  /** Extra class on the rendered surface (e.g. a size/context modifier). */
  className?: string;
}

/**
 * Read-only markdown render. Uses the SAME Tiptap engine as the editors, so a
 * comment composed in the WYSIWYG box renders identically here — and inherits
 * `html:false` (no raw-HTML / stored-XSS, the whole point of the IW-6 audit).
 * `breaks:true` keeps single newlines from legacy plain-text comments visible;
 * links are clickable (open in a new tab via the Link extension defaults).
 * Mounted only via the lazy wrapper in `markdown-view.tsx`.
 */
export function MarkdownViewImpl({ value, className }: MarkdownViewProps) {
  // See MarkdownEditorImpl — same Tiptap/React-Compiler escape hatch.
  'use no memo';

  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: markdownExtensions({ linkOpenOnClick: true, breaks: true }),
    content: value,
    editorProps: { attributes: { class: `md-render${className ? ` ${className}` : ''}` } },
  });

  // Reflect external value changes (e.g. an edited or re-fetched comment).
  useEffect(() => {
    if (!editor) return;
    if (getMarkdown(editor) !== value) editor.commands.setContent(value);
  }, [value, editor]);

  return <EditorContent editor={editor} />;
}
