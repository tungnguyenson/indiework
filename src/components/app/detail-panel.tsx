'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTaskDetail, type TaskDetail } from '@/app/_actions/queries';
import {
  updateTask,
  setTaskStatusNote,
  addTaskComment,
  deleteTask,
} from '@/app/_actions/tasks';
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
import type { UpdateTaskInput } from '@/server/validators/task';
import { Popover, OptionList } from '@/components/ui/popover';
import { RefTag } from '@/components/ui/interactive';
import { PriorityBars } from '@/components/ui/bits';
import { Ic } from '@/components/ui/icons';

export function DetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    getTaskDetail(taskId).then((d) => {
      if (alive) setDetail(d);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = useCallback(
    async (p: UpdateTaskInput) => {
      const updated = await updateTask(taskId, p);
      setDetail((d) => (d ? { ...d, task: updated } : d));
      router.refresh();
    },
    [taskId, router],
  );

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

  const { task, comments, modules, milestones } = detail;
  // NOTE: Phase 1 renames this to `pending` + redesigns the status note.
  const blocked = task.status === 'pending';
  const moduleName = modules.find((m) => m.id === task.moduleId)?.name;
  const moduleColor = modules.find((m) => m.id === task.moduleId)?.color;
  const milestoneName = milestones.find((m) => m.id === task.milestoneId)?.name;

  const onDelete = async () => {
    await deleteTask(taskId);
    onClose();
    router.refresh();
  };

  return (
    <section className="detail-panel">
      <div className="dp-head">
        {task.ref ? <RefTag value={task.ref} big /> : <span className="ref-tag ref-big">Inbox</span>}
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Ic.close size={18} />
        </button>
      </div>

      <div className="dp-body">
        <div className="dp-check-title">
          <TitleEditor key={task.id} value={task.title} onSave={(title) => patch({ title })} />
        </div>

        <StatusNote
          key={`note-${task.id}`}
          value={task.statusNote ?? ''}
          blocked={blocked}
          onSave={async (note) => {
            const updated = await setTaskStatusNote(taskId, note);
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
                <button className="prop-control" type="button" data-empty={moduleName ? undefined : ''}>
                  {moduleName ? (
                    <>
                      <span className="dot" style={{ background: moduleColor ?? 'var(--text-faint)' }} />
                      {moduleName}
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
              await addTaskComment(taskId, body);
              const fresh = await getTaskDetail(taskId);
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
  const [v, setV] = useState(value);
  return (
    <textarea
      className="dp-title-input"
      value={v}
      rows={1}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && onSave(v.trim())}
      spellCheck={false}
    />
  );
}

function StatusNote({
  value,
  blocked,
  onSave,
}: {
  value: string;
  blocked: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div className="status-note" data-blocked={blocked ? '' : undefined}>
      <div className="status-note-label">
        <Ic.bolt size={13} /> Current state · what&apos;s the status?
      </div>
      <textarea
        value={v}
        rows={2}
        placeholder="What's blocking this, or where is it right now?"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
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
