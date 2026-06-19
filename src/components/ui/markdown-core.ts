import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import type { Extensions } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';

/**
 * The single Tiptap markdown engine, shared by every markdown surface so what
 * you compose renders identically everywhere: the description editor, the
 * comment composer, and the read-only activity view. Keeping one factory means
 * StarterKit's input rules, `html:false` (no raw-HTML/XSS), and markdown I/O
 * never drift between input and display.
 */
export interface MarkdownExtensionOptions {
  /** When set, mounts the placeholder extension (editable surfaces only). */
  placeholder?: string;
  /** Follow links on click — true for read views, false while editing. */
  linkOpenOnClick?: boolean;
  /** Render a single newline as `<br>` (markdown-it `breaks`); keeps legacy
   *  plain-text comments — e.g. agent context dumps — from collapsing. */
  breaks?: boolean;
}

export function markdownExtensions({
  placeholder,
  linkOpenOnClick = false,
  breaks = false,
}: MarkdownExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: linkOpenOnClick } }),
    ...(placeholder !== undefined ? [Placeholder.configure({ placeholder })] : []),
    Markdown.configure({ html: false, breaks, transformPastedText: true, transformCopiedText: true }),
  ];
}

/** Serialize the editor's current document back to markdown (the stored format). */
export const getMarkdown = (editor: Editor): string =>
  (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();

/** Runtime shape of tiptap-markdown's parser (markdown → HTML); not in its public types. */
interface MarkdownParserApi {
  parse(content: string, options?: { inline?: boolean }): string;
}
const getMarkdownParser = (editor: Editor): MarkdownParserApi | undefined =>
  (editor.storage as unknown as { markdown?: { parser?: MarkdownParserApi } }).markdown?.parser;

/** Parse an HTML fragment string into a detached <body> so ProseMirror can read it. */
const elementFromString = (html: string): HTMLElement =>
  new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

/**
 * Render clipboard plain-text as markdown into the editor. ProseMirror prefers
 * the clipboard's `text/html` flavor when present (VS Code, browsers, Notion,
 * chat apps all attach one), so tiptap-markdown's `transformPastedText` never
 * sees the plain text and the syntax stays literal. We intercept here, take the
 * plain-text flavor, and render it as markdown ourselves. Returns false to defer
 * to the default handlers (images, empty clipboards, code blocks, errors).
 */
export function insertMarkdownFromPaste(editor: Editor, view: EditorView, event: ClipboardEvent): boolean {
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
}
