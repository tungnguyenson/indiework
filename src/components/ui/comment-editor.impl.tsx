'use client';

import { useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { markdownExtensions, getMarkdown, insertMarkdownFromPaste } from './markdown-core';

export interface CommentEditorProps {
  /** Markdown body to seed the editor with — the comment being edited. */
  value: string;
  /** Persist the edited markdown (only called when it actually changed). */
  onSave: (body: string) => Promise<void> | void;
  /** Leave edit mode without persisting (Esc, or a no-op/empty blur). */
  onCancel: () => void;
}

/**
 * Edit-in-place editor for an existing comment. Mirrors the description editor's
 * blur-to-save lifecycle (no buttons): click a comment to edit, click away to
 * save, Esc to cancel. ⌘/Ctrl+Enter commits explicitly (just blurs). Shares the
 * one markdown engine in `markdown-core`, so an edited comment renders
 * identically to a fresh one. Mounted only via the lazy wrapper in
 * `comment-editor.tsx`.
 */
export function CommentEditorImpl({ value, onSave, onCancel }: CommentEditorProps) {
  // See MarkdownEditorImpl — same Tiptap/React-Compiler escape hatch.
  'use no memo';

  // Set just before an intentional Esc/unmount blur so onBlur skips the save.
  const cancelledRef = useRef(false);

  const editor: Editor | null = useEditor({
    immediatelyRender: false,
    autofocus: 'end',
    extensions: markdownExtensions({ placeholder: 'Edit comment…', breaks: true }),
    content: value,
    editorProps: {
      attributes: { class: 'md-render md-wysiwyg comment-input' },
      handlePaste: (view, event) => (editor ? insertMarkdownFromPaste(editor, view, event) : false),
    },
    onBlur: ({ editor }) => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      const next = getMarkdown(editor).trim();
      // Empty or unchanged → leave the comment as-is (never persist a blank).
      if (!next || next === value.trim()) {
        onCancel();
        return;
      }
      void onSave(next);
    },
  });

  return (
    <div
      className="comment-box comment-box--edit"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelledRef.current = true; // guard the unmount blur from saving
          onCancel();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          // Explicit commit — blurring runs the save-on-blur path above.
          e.preventDefault();
          editor?.commands.blur();
        }
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
