'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTaskDetail, getTaskDetailByRef, type TaskDetail } from '@/app/_actions/queries';
import {
  updateTask,
  setTaskStatusNote,
  addTaskComment,
  deleteTask,
  addSubtask,
  toggleTaskDone,
  addAttachment,
  removeAttachment,
} from '@/app/_actions/tasks';
import type { TaskDto } from '@/server/services';
import { toggledDone } from '@/lib/optimistic';
import {
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_PRIORITY,
  TASK_PRIORITY_LABEL,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';
import { fmtDate, fmtDay, toDateInputValue } from '@/lib/dates';
import { mdToHtml } from '@/lib/markdown';
import { commitOnEnter } from '@/lib/inline-edit';
import type { UpdateTaskInput } from '@/server/validators/task';
import { useTaskNav } from '@/lib/task-nav';
import { Popover, OptionList } from '@/components/ui/popover';
import { RefTag } from '@/components/ui/interactive';
import { PriorityBars, ModuleIcon, Progress } from '@/components/ui/bits';
import { CircleCheck } from '@/components/ui/interactive';
import { Ic } from '@/components/ui/icons';

export function DetailPanel({
  taskRef,
  taskId,
  onClose,
}: {
  taskRef: string | null;
  taskId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { openTask } = useTaskNav();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Project tasks resolve by ref (path URL); Inbox tasks by uuid (?task=).
  const fetchDetail = useCallback(
    () => (taskRef ? getTaskDetailByRef(taskRef) : getTaskDetail(taskId as string)),
    [taskRef, taskId],
  );

  // Re-fetch on task switch. We intentionally don't reset detail to null here:
  // the panel keeps showing the previous task until the new one loads, so
  // switching issues neither flashes the skeleton nor replays the slide-in.
  useEffect(() => {
    let alive = true;
    setMissing(false);
    setConfirmDel(false);
    fetchDetail()
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [fetchDetail]);

  // Stay in sync when the same task is edited elsewhere (e.g. inline rename in
  // the list) — the list broadcasts the patch so the open panel reflects it.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const { id, patch } = (e as CustomEvent<{ id: string; patch: UpdateTaskInput }>).detail;
      setDetail((d) => (d && d.task.id === id ? { ...d, task: { ...d.task, ...patch } } : d));
    };
    window.addEventListener('iw:task-updated', onUpdated);
    return () => window.removeEventListener('iw:task-updated', onUpdated);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (missing) {
    return (
      <section className="detail-panel">
        <div className="dp-head">
          <span className="ref-tag ref-big">{taskRef ?? 'Task'}</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Ic.close size={18} />
          </button>
        </div>
        <div className="dp-body">
          <p className="dp-section-label">This task no longer exists.</p>
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="detail-panel" aria-busy>
        <div className="dp-head">
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Ic.close size={18} />
          </button>
        </div>
      </section>
    );
  }

  const { task, displayRef, parent, children, comments, modules, milestones } = detail;
  const tid = task.id;
  const pending = task.status === 'pending';
  const subDone = children.filter((c) => c.done).length;
  const taskModule = modules.find((m) => m.id === task.moduleId);
  const milestoneName = milestones.find((m) => m.id === task.milestoneId)?.name;

  const reload = async () => {
    const fresh = await fetchDetail();
    setDetail(fresh);
    router.refresh();
  };

  const patch = async (p: UpdateTaskInput) => {
    const updated = await updateTask(tid, p);
    setDetail((d) => (d ? { ...d, task: updated } : d));
    router.refresh();
  };

  const onDelete = async () => {
    await deleteTask(tid);
    onClose();
    router.refresh();
  };

  return (
    <section className="detail-panel">
      <div className="dp-head">
        {displayRef ? <RefTag value={displayRef} big /> : <span className="ref-tag ref-big">Inbox</span>}
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Ic.close size={18} />
        </button>
      </div>

      <div className="dp-body">
        {parent && (
          <button className="dp-parent" type="button" onClick={() => openTask(parent)}>
            <Ic.cornerDownRight size={13} /> Sub-task of · <b>{parent.title}</b>
            {parent.ref && <span className="dp-parent-ref">{parent.ref}</span>}
          </button>
        )}
        <div className="dp-check-title">
          <TitleEditor key={task.id} value={task.title} onSave={(title) => patch({ title })} />
        </div>

        <StatusNote
          key={`note-${task.id}`}
          value={task.statusNote ?? ''}
          pending={pending}
          onSave={async (note) => {
            const updated = await setTaskStatusNote(tid, note);
            setDetail((d) => (d ? { ...d, task: updated } : d));
            router.refresh();
          }}
        />

        <div className="prop-grid">
          <span className="prop-label">Status</span>
          <span className="prop-val">
            <Popover
              width={190}
              trigger={
                <button className="prop-control" type="button">
                  <span className="dot" style={{ background: `var(--st-${task.status})` }} />
                  {TASK_STATUS_LABEL[task.status]}
                </button>
              }
            >
              {(close) => (
                <OptionList
                  options={TASK_STATUS.map((s) => ({ id: s, label: TASK_STATUS_LABEL[s] }))}
                  value={task.status}
                  onPick={(id) => {
                    patch({ status: id as TaskStatus });
                    close();
                  }}
                  renderOpt={(o) => (
                    <>
                      <span className="dot" style={{ background: `var(--st-${o.id})` }} />
                      {o.label}
                    </>
                  )}
                />
              )}
            </Popover>
          </span>

          <span className="prop-label">Priority</span>
          <span className="prop-val">
            <Popover
              width={180}
              trigger={
                <button className="prop-control" type="button">
                  <PriorityBars priority={task.priority} showLabel />
                </button>
              }
            >
              {(close) => (
                <OptionList
                  options={TASK_PRIORITY.map((p) => ({ id: p, label: TASK_PRIORITY_LABEL[p] }))}
                  value={task.priority}
                  onPick={(id) => {
                    patch({ priority: id as TaskPriority });
                    close();
                  }}
                  renderOpt={(o) => (
                    <>
                      <PriorityBars priority={o.id as TaskPriority} /> {o.label}
                    </>
                  )}
                />
              )}
            </Popover>
          </span>

          <span className="prop-label">Module</span>
          <span className="prop-val">
            <Popover
              width={210}
              trigger={
                <button className="prop-control" type="button" data-empty={taskModule ? undefined : ''}>
                  {taskModule ? (
                    <>
                      <ModuleIcon icon={taskModule.icon} color={taskModule.color} size={14} />
                      {taskModule.name}
                    </>
                  ) : (
                    'Set module'
                  )}
                </button>
              }
            >
              {(close) => (
                <OptionList
                  options={[{ id: '', label: 'No module' }, ...modules.map((m) => ({ id: m.id, label: m.name }))]}
                  value={task.moduleId ?? ''}
                  onPick={(id) => {
                    patch({ moduleId: id || null });
                    close();
                  }}
                />
              )}
            </Popover>
          </span>

          <span className="prop-label">Milestone</span>
          <span className="prop-val">
            <Popover
              width={220}
              trigger={
                <button className="prop-control" type="button" data-empty={milestoneName ? undefined : ''}>
                  {milestoneName ? (
                    <>
                      <Ic.target size={13} /> {milestoneName}
                    </>
                  ) : (
                    'Set milestone'
                  )}
                </button>
              }
            >
              {(close) => (
                <OptionList
                  options={[
                    { id: '', label: 'No milestone' },
                    ...milestones.map((m) => ({ id: m.id, label: m.name })),
                  ]}
                  value={task.milestoneId ?? ''}
                  onPick={(id) => {
                    patch({ milestoneId: id || null });
                    close();
                  }}
                />
              )}
            </Popover>
          </span>

          <span className="prop-label">Due date</span>
          <span className="prop-val">
            <Popover
              width={210}
              trigger={
                <button className="prop-control" type="button" data-empty={task.dueDate ? undefined : ''}>
                  <Ic.calendar size={13} /> {task.dueDate ? fmtDate(task.dueDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set date'}
                </button>
              }
            >
              {(close) => (
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="date"
                    className="ov-date"
                    defaultValue={toDateInputValue(task.dueDate)}
                    onChange={(e) => {
                      patch({ dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null });
                    }}
                  />
                  <button
                    className="dp-reset"
                    type="button"
                    onClick={() => {
                      patch({ dueDate: null });
                      close();
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </Popover>
          </span>
        </div>

        <p className="dp-section-label">Description</p>
        <DescriptionEditor key={`desc-${task.id}`} value={task.description ?? ''} onSave={(d) => patch({ description: d })} />

        {!task.parentId && (
          <div className="dp-subtasks">
            <div className="dp-subtasks-head">
              <span className="dp-section-label" style={{ margin: 0 }}>
                <Ic.listTree size={13} /> Sub-tasks
              </span>
              {children.length > 0 && (
                <span className="dp-subtasks-prog">
                  {subDone}/{children.length}
                  <Progress value={children.length ? subDone / children.length : 0} tone={subDone === children.length ? 'done' : 'accent'} />
                </span>
              )}
            </div>
            {children.map((c) => (
              <SubRow
                key={c.id}
                child={c}
                onOpen={() => openTask(c)}
                onToggle={async () => {
                  // Flip the sub-task circle now (matches the panel's manual-optimistic pattern), then reconcile.
                  setDetail((d) => (d ? { ...d, children: d.children.map((x) => (x.id === c.id ? { ...x, ...toggledDone(x.status) } : x)) } : d));
                  await toggleTaskDone(c.id);
                  reload();
                }}
              />
            ))}
            <InlineSubAdd onAdd={async (title) => { await addSubtask(task.id, title); reload(); }} />
          </div>
        )}

        <Attachments taskId={task.id} items={detail.attachments} onChanged={reload} />

        <div className="activity">
          <p className="dp-section-label">Activity</p>
          {comments.map((c) => (
            <div className="act-item" key={c.id}>
              <span className="act-day">{fmtDay(c.createdAt)}</span>
              <div className="act-body">
                <span className="act-text">{c.body}</span>
                {c.source !== 'web' && (
                  <span className="act-src" data-src={c.source === 'mcp' ? 'agent' : c.source}>
                    {c.source}
                  </span>
                )}
              </div>
            </div>
          ))}
          <CommentBox
            onSend={async (body) => {
              await addTaskComment(tid, body);
              const fresh = await fetchDetail();
              setDetail(fresh);
              router.refresh();
            }}
          />
        </div>
      </div>

      <div className="dp-foot">
        {confirmDel ? (
          <span className="del-confirm">
            Delete this task?
            <button className="yes" onClick={onDelete}>
              Delete
            </button>
            <button className="no" onClick={() => setConfirmDel(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="del-btn" type="button" onClick={() => setConfirmDel(true)}>
            <Ic.trash size={15} /> Delete task
          </button>
        )}
      </div>
    </section>
  );
}

function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
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
function StatusNote({
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

function DescriptionEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (editing) {
    return (
      <div className="dp-desc">
        <textarea
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (v !== value) onSave(v);
          }}
          placeholder="Add a description… (markdown)"
        />
      </div>
    );
  }
  return (
    <div
      className="dp-desc md-render"
      data-empty={value ? undefined : ''}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
      {...(value ? { dangerouslySetInnerHTML: { __html: mdToHtml(value) } } : {})}
    >
      {value ? null : 'Add a description…'}
    </div>
  );
}

function CommentBox({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    try {
      await onSend(v.trim());
      setV('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="comment-box">
      <textarea
        value={v}
        rows={1}
        placeholder="Log progress…"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="comment-send" type="button" onClick={send} disabled={!v.trim() || busy} aria-label="Add comment">
        <Ic.arrowRight size={16} />
      </button>
    </div>
  );
}

function SubRow({
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
function Attachments({ taskId, items, onChanged }: { taskId: string; items: AttachmentItem[]; onChanged: () => Promise<void> }) {
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
function InlineSubAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
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
