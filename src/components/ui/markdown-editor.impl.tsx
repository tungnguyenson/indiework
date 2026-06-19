'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { markdownExtensions, getMarkdown, insertMarkdownFromPaste } from './markdown-core';

export interface MarkdownEditorProps {
  /** Current markdown string — the stored source of truth, kept verbatim. */
  value: string;
  /** Called on blur with the serialized markdown, only when it changed. */
  onSave: (markdown: string) => void;
  placeholder?: string;
  /** Extra class on the editable surface (e.g. a size modifier). */
  className?: string;
  autoFocus?: boolean;
}

/**
 * No-toolbar WYSIWYG markdown editor for task & project descriptions. StarterKit's
 * input rules transform `# `, `**bold**`, `- `, `> `, `` `code` `` as you type;
 * the shared engine in `markdown-core` keeps markdown as the I/O format so storage,
 * the MCP server, and the read views are untouched. Saves on blur (inline edit).
 * Mounted only via the lazy wrapper in `markdown-editor.tsx`.
 */
export function MarkdownEditorImpl({ value, onSave, placeholder, className, autoFocus }: MarkdownEditorProps) {
  // React Compiler memoizes too aggressively around Tiptap's editor instance and
  // can leave it stale — opt this component out (Tiptap's documented escape hatch).
  'use no memo';

  // Annotated so `editor`'s type isn't inferred from a config that references it
  // (handlePaste → insertMarkdownFromPaste(editor, …)) — that's a circular inference.
  const editor: Editor | null = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    extensions: markdownExtensions({ placeholder: placeholder ?? 'Write…' }),
    content: value,
    editorProps: {
      attributes: { class: `md-render md-wysiwyg${className ? ` ${className}` : ''}` },
      handlePaste: (view, event) => (editor ? insertMarkdownFromPaste(editor, view, event) : false),
    },
    onBlur: ({ editor }) => {
      const next = getMarkdown(editor);
      if (next !== value) onSave(next);
    },
  });

  // Reflect external value changes (reset elsewhere) without clobbering an
  // in-progress edit or jumping the caret.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (getMarkdown(editor) !== value) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return <EditorContent editor={editor} />;
}
