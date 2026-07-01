'use client';

/**
 * Leaf editors + helpers shared by the task detail surfaces — the slide-in
 * inspector panel (1-column) and the standalone full page (2-column). Kept
 * presentational: each takes a value + an onSave/onChanged callback and owns no
 * fetch/persistence of its own, so both layouts compose them identically.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TaskDto } from '@/server/services';
import type { TaskDetail } from '@/app/_actions/queries';
import { uploadAttachment, removeAttachment } from '@/app/_actions/tasks';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentSizeLimitLabel,
  attachmentUploadErrorMessage,
} from '@/server/attachment-limits';
import { previewKind, attachmentDownloadUrl } from '@/lib/attachment-preview';
import { filesFromClipboard, withPasteName } from '@/lib/clipboard-files';
import { AttachmentPreview } from './attachment-preview';
import { commitOnEnter } from '@/lib/inline-edit';
import { CircleCheck } from '@/components/ui/interactive';
import { useRun } from '@/components/ui/toast';
import { Ic } from '@/components/ui/icons';

export function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [v, setV] = useState(value);

  // Reflect external edits (e.g. inline rename in the list) into the field.
  // `value` only changes on a real external update, never mid-typing here, so
  // this won't clobber in-progress input.
  useEffect(() => setV(value), [value]);

  // Auto-grow to fit the full title — a fixed rows={1} textarea clipped long
  // titles to one line in both display and edit (IW-10).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);

  return (
    <textarea
      ref={ref}
      className="dp-title-input"
      value={v}
      rows={1}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={commitOnEnter}
      onBlur={() => v.trim() && v !== value && onSave(v.trim())}
      spellCheck={false}
    />
  );
}

/**
 * Status note: one elevated, overwritten line — distinct from the append-only
 * Activity log. Only surfaces when there's a note or the task is pending;
 * otherwise it collapses to a quiet "Add status note" affordance.
 */
export function StatusNote({
  value,
  pending,
  onSave,
}: {
  value: string;
  pending: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState(pending || value.trim() !== '');

  if (!open) {
    return (
      <button className="dp-note-add" type="button" onClick={() => setOpen(true)}>
        <Ic.sparkle size={14} /> Add status note
      </button>
    );
  }

  return (
    <div className="status-note" data-pending={pending ? '' : undefined}>
      <div className="status-note-label">
        {pending ? <Ic.bolt size={13} /> : <Ic.sparkle size={13} />}
        {pending ? "What's this waiting on?" : "Current state · what's the status?"}
      </div>
      <textarea
        autoFocus={!value}
        value={v}
        rows={2}
        placeholder="One line — where this stands right now"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== value) onSave(v);
          if (!v.trim() && !pending) setOpen(false);
        }}
      />
    </div>
  );
}

export function SubRow({
  child,
  onOpen,
  onToggle,
}: {
  child: TaskDto & { displayRef: string | null };
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="dp-sub-row" data-done={child.done ? '' : undefined} onClick={onOpen}>
      <CircleCheck done={child.done} status={child.status} size={16} onToggle={onToggle} />
      <span className="dp-sub-title">{child.title}</span>
      {child.displayRef && <span className="task-ref">{child.displayRef}</span>}
      <Ic.chevronRight size={14} className="dp-sub-chev" />
    </div>
  );
}

/** Deterministic per-extension hue so a set of files reads as a set. */
function extHue(ext: string): number {
  let h = 0;
  for (let i = 0; i < ext.length; i++) h = (h * 31 + ext.charCodeAt(i)) % 360;
  return h;
}

type AttachmentItem = TaskDetail['attachments'][number];

/** Attachments section — uploads go to R2 (or in-memory storage in tests). */
export function Attachments({ taskId, items, onChanged }: { taskId: string; items: AttachmentItem[]; onChanged: () => Promise<void> }) {
  const run = useRun();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const sizeLimit = attachmentSizeLimitLabel();

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || uploading) return;
    setError(null);
    setUploading(true);
    const failures: string[] = [];
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          failures.push(`${f.name} exceeds the ${sizeLimit} limit`);
          continue;
        }
        try {
          const fd = new FormData();
          fd.set('file', f);
          await uploadAttachment(taskId, fd);
        } catch (e) {
          failures.push(`${f.name}: ${attachmentUploadErrorMessage(e)}`);
        }
      }
      if (failures.length) {
        setError(failures.join(' · '));
      } else {
        await onChanged();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // Paste-to-attach: this section only mounts while a task is open, so a
  // window-level listener means Cmd/Ctrl+V with an image (or any file) on the
  // clipboard uploads it here — the familiar "paste a screenshot" shortcut. We
  // go window-wide rather than binding a focused drop zone so it works from
  // anywhere in the open task, mirroring drag-drop. A text-only paste yields no
  // files and falls through untouched to whatever input/editor has focus.
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFromClipboard(e.clipboardData).map(withPasteName);
      if (!files.length) return;
      e.preventDefault();
      void addFilesRef.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="dp-attach">
      <div className="dp-attach-head">
        <span className="dp-section-label" style={{ margin: 0 }}>
          <Ic.paperclip size={13} /> Attachments
        </span>
        {items.length > 0 && <span className="dp-attach-count">{items.length}</span>}
        <button className="dp-attach-add" type="button" onClick={() => inputRef.current?.click()}>
          <Ic.plus size={13} /> Add
        </button>
      </div>

      {items.map((a) => {
        const hue = extHue(a.ext ?? a.name);
        const hasFile = Boolean(a.path);
        const downloadUrl = hasFile ? attachmentDownloadUrl(a.id) : undefined;
        const canPreview = hasFile && previewKind(a) !== 'none';
        const openPreview = canPreview ? () => setPreview(a) : undefined;
        return (
          <div className="attach-item" key={a.id} data-preview={canPreview ? '' : undefined}>
            <span
              className="attach-tile"
              data-image={a.type === 'image' ? '' : undefined}
              style={{ '--att-hue': hue } as React.CSSProperties}
              onClick={openPreview}
            >
              {a.type === 'image' && downloadUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- same-origin authenticated download URL
                <img src={downloadUrl} alt="" className="attach-thumb" />
              ) : a.type === 'image' ? (
                <Ic.image size={16} />
              ) : (
                <Ic.fileText size={16} />
              )}
            </span>
            <div
              className="attach-body"
              role={canPreview ? 'button' : undefined}
              tabIndex={canPreview ? 0 : undefined}
              onClick={openPreview}
              onKeyDown={
                canPreview
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreview(a);
                      }
                    }
                  : undefined
              }
            >
              <span className="attach-name">{a.name}</span>
              <span className="attach-meta">
                {(a.ext || a.type).toUpperCase()} · {a.size ?? '—'}
              </span>
            </div>
            {downloadUrl ? (
              <a className="attach-act" href={downloadUrl} download={a.name} title="Download">
                <Ic.download size={15} />
              </a>
            ) : (
              <button className="attach-act" type="button" title="Download unavailable" disabled>
                <Ic.download size={15} />
              </button>
            )}
            <button
              className="attach-act"
              type="button"
              title="Remove"
              onClick={() =>
                run(
                  async () => {
                    await removeAttachment(a.id);
                    await onChanged();
                  },
                  { error: "Couldn't remove that attachment.", retry: false },
                )
              }
            >
              <Ic.close size={15} />
            </button>
          </div>
        );
      })}

      <div
        className="attach-drop"
        data-over={over ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <Ic.paperclip size={15} />
        <span>
          {uploading ? (
            'Uploading…'
          ) : (
            <>
              Drag files here, paste, or <b>browse</b>
              <span className="attach-limit"> · max {sizeLimit}</span>
            </>
          )}
        </span>
      </div>
      {error && (
        <p className="attach-error" role="alert">
          {error}
        </p>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      {preview && <AttachmentPreview key={preview.id} att={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** Quiet "+ Add sub-task" that becomes an input; Enter adds and keeps focus. */
export function InlineSubAdd({ onAdd }: { onAdd: (title: string) => Promise<boolean | undefined> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  if (!editing) {
    return (
      <button className="dp-sub-add" type="button" onClick={() => setEditing(true)}>
        <Ic.plus size={14} /> Add sub-task
      </button>
    );
  }
  const submit = async () => {
    const t = v.trim();
    if (t && (await onAdd(t))) setV(''); // clear only on success; keep the draft on failure
  };
  return (
    <div className="dp-sub-add editing">
      <Ic.plus size={14} />
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Sub-task title… (Enter to add)"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => !v.trim() && setEditing(false)}
      />
    </div>
  );
}
