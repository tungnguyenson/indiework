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
import { addAttachment, removeAttachment } from '@/app/_actions/tasks';
import { commitOnEnter } from '@/lib/inline-edit';
import { CircleCheck } from '@/components/ui/interactive';
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

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}
/** Deterministic per-extension hue so a set of files reads as a set. */
function extHue(ext: string): number {
  let h = 0;
  for (let i = 0; i < ext.length; i++) h = (h * 31 + ext.charCodeAt(i)) % 360;
  return h;
}

type AttachmentItem = TaskDetail['attachments'][number];

/**
 * Attachments section. Files + images on a task. NOTE: byte storage is deferred —
 * adding a file persists its metadata only (name/type/size/ext); there is no
 * download target yet. See docs/v3-implementation-plan.md §Phase 7.
 */
export function Attachments({ taskId, items, onChanged }: { taskId: string; items: AttachmentItem[]; onChanged: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const ext = extOf(f.name);
      await addAttachment({
        taskId,
        name: f.name,
        type: f.type.startsWith('image/') ? 'image' : 'file',
        size: humanSize(f.size),
        ext: ext || null,
      });
    }
    await onChanged();
  };

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
        return (
          <div className="attach-item" key={a.id}>
            <span
              className="attach-tile"
              data-image={a.type === 'image' ? '' : undefined}
              style={{ '--att-hue': hue } as React.CSSProperties}
            >
              {a.type === 'image' ? <Ic.image size={16} /> : <Ic.fileText size={16} />}
            </span>
            <div className="attach-body">
              <span className="attach-name">{a.name}</span>
              <span className="attach-meta">
                {(a.ext || a.type).toUpperCase()} · {a.size ?? '—'}
              </span>
            </div>
            <button className="attach-act" type="button" title="Download (storage pending)" disabled>
              <Ic.download size={15} />
            </button>
            <button
              className="attach-act"
              type="button"
              title="Remove"
              onClick={async () => {
                await removeAttachment(a.id);
                await onChanged();
              }}
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
          Drag files here or <b>browse</b>
        </span>
      </div>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
    </div>
  );
}

/** Quiet "+ Add sub-task" that becomes an input; Enter adds and keeps focus. */
export function InlineSubAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
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
    if (t) {
      await onAdd(t);
      setV('');
    }
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
