'use client';

import { useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { markdownExtensions, getMarkdown, insertMarkdownFromPaste } from './markdown-core';
import { Ic } from '@/components/ui/icons';

export interface CommentComposerProps {
  /** Append a comment; receives the serialized markdown. Composer clears on resolve. */
  onSend: (body: string) => Promise<void>;
}

/**
 * Comment composer — a Tiptap markdown editor (replaces the old plain textarea).
 * Distinct lifecycle from the description editor: it composes-and-clears on send
 * rather than saving on blur. Plain Enter inserts a new paragraph (visible, so
 * multi-line notes no longer scroll out of view — IW-16); ⌘/Ctrl+Enter sends.
 * Mounted only via the lazy wrapper in `comment-composer.tsx`.
 */
export function CommentComposerImpl({ onSend }: CommentComposerProps) {
  // See MarkdownEditorImpl — same Tiptap/React-Compiler escape hatch.
  'use no memo';

  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(true);

  // Annotated to break the circular inference (config → handlePaste → editor).
  const editor: Editor | null = useEditor({
    immediatelyRender: false,
    extensions: markdownExtensions({ placeholder: 'Log progress…', breaks: true }),
    editorProps: {
      attributes: { class: 'md-render md-wysiwyg comment-input' },
      handlePaste: (view, event) => (editor ? insertMarkdownFromPaste(editor, view, event) : false),
    },
    onUpdate: ({ editor }) => setEmpty(editor.isEmpty),
  });

  const send = async () => {
    if (!editor || busy) return;
    const body = getMarkdown(editor).trim();
    if (!body) return; // empty doc serializes to whitespace — never send a blank comment
    setBusy(true);
    try {
      await onSend(body);
      editor.commands.clearContent();
      setEmpty(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="comment-box"
      onKeyDown={(e) => {
        // ⌘/Ctrl+Enter sends; plain Enter is handled by the editor (new paragraph).
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void send();
        }
      }}
    >
      <EditorContent editor={editor} />
      <div className="comment-foot">
        <button
          className="comment-send"
          type="button"
          onClick={() => void send()}
          disabled={empty || busy}
          aria-label="Add comment"
          title="Add comment (⌘+Enter)"
        >
          <Ic.arrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
