'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';

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

const getMarkdown = (editor: Editor): string =>
  (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();

/**
 * No-toolbar WYSIWYG markdown editor. StarterKit's input rules transform `# `,
 * `**bold**`, `- `, `> `, `` `code` `` as you type; `tiptap-markdown` keeps
 * markdown as the I/O format so storage, the MCP server, and the read views are
 * untouched. Mounted only via the lazy wrapper in `markdown-editor.tsx`.
 */
export function MarkdownEditorImpl({ value, onSave, placeholder, className, autoFocus }: MarkdownEditorProps) {
  // React Compiler memoizes too aggressively around Tiptap's editor instance and
  // can leave it stale — opt this component out (Tiptap's documented escape hatch).
  'use no memo';

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write…' }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: { class: `md-render md-wysiwyg${className ? ` ${className}` : ''}` },
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
