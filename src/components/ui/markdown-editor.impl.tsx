'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';

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

/** Runtime shape of tiptap-markdown's parser (markdown string → HTML string); not in its public types. */
interface MarkdownParserApi {
  parse(content: string, options?: { inline?: boolean }): string;
}

const getMarkdownParser = (editor: Editor): MarkdownParserApi | undefined =>
  (editor.storage as unknown as { markdown?: { parser?: MarkdownParserApi } }).markdown?.parser;

/** Parse an HTML fragment string into a detached <body> so ProseMirror can read it. */
const elementFromString = (html: string): HTMLElement =>
  new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

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
      // Pasted markdown: ProseMirror prefers the clipboard's `text/html` flavor when
      // present (VS Code, browsers, Notion, chat apps all attach one), so tiptap-markdown's
      // `transformPastedText` never sees the plain text and the syntax stays literal. We
      // intercept here, take the plain-text flavor, and render it as markdown ourselves.
      handlePaste: (view, event) => {
        if (!editor) return false;
        // Inside a code block, paste must stay literal — let ProseMirror handle it.
        if (view.state.selection.$from.parent.type.spec.code) return false;
        const text = event.clipboardData?.getData('text/plain');
        if (!text?.trim()) return false; // images / empty → defer to default handlers
        const parser = getMarkdownParser(editor);
        if (!parser) return false;
        try {
          // markdown → HTML, then parse that HTML straight into a PM slice. We must NOT route
          // through editor.commands.insertContent: tiptap-markdown overrides insertContentAt to
          // re-run the markdown parser on its input, so feeding it HTML double-parses and (with
          // html:false) escapes the tags into literal `&lt;h1&gt;` text.
          const { state } = view;
          const slice = PMDOMParser.fromSchema(state.schema).parseSlice(elementFromString(parser.parse(text)), {
            preserveWhitespace: true,
            context: state.selection.$from,
          });
          view.dispatch(state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        } catch {
          return false; // anything unexpected → fall back to default paste
        }
      },
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
