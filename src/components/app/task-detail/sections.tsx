'use client';

/**
 * Composed task-detail sections shared by the inspector panel (1-column) and
 * the standalone task page (2-column). Each takes already-loaded data plus the
 * hook's mutation callbacks. Navigation to related tasks is INJECTED via
 * `onOpenTask` so the panel can open a peek overlay while the page routes to a
 * full page — the sections themselves stay layout-agnostic.
 */
import { useState } from 'react';
import type { TaskDetail } from '@/app/_actions/queries';
import type { OpenableTask } from '@/lib/task-nav';
import {
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_PRIORITY,
  TASK_PRIORITY_LABEL,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';
import { fmtDate, fmtDay, toDateInputValue } from '@/lib/dates';
import type { UpdateTaskInput } from '@/server/validators/task';
import { Popover, OptionList } from '@/components/ui/popover';
import { PriorityBars, ModuleIcon, Progress } from '@/components/ui/bits';
import { Ic } from '@/components/ui/icons';
import { MarkdownView } from '@/components/ui/markdown-view';
import { CommentComposer } from '@/components/ui/comment-composer';
import { CommentEditor } from '@/components/ui/comment-editor';
import { SubRow, InlineSubAdd } from './parts';

/** "Sub-task of <parent>" affordance — opens the parent via the injected nav. */
export function ParentLink({ parent, onOpenTask }: { parent: TaskDetail['parent']; onOpenTask: (t: OpenableTask) => void }) {
  if (!parent) return null;
  return (
    <button className="dp-parent" type="button" onClick={() => onOpenTask(parent)}>
      <Ic.cornerDownRight size={13} /> Sub-task of · <b>{parent.title}</b>
      {parent.ref && <span className="dp-parent-ref">{parent.ref}</span>}
    </button>
  );
}

/**
 * Editable property controls (status, priority, module, milestone, due date).
 * `layout="grid"` lays label beside control (panel); `layout="rail"` stacks
 * label above a full-width control for the page's right sidebar.
 */
export function TaskProperties({
  detail,
  patch,
  layout = 'grid',
}: {
  detail: TaskDetail;
  patch: (p: UpdateTaskInput) => void;
  layout?: 'grid' | 'rail';
}) {
  const { task, modules, milestones } = detail;
  const taskModule = modules.find((m) => m.id === task.moduleId);
  const milestoneName = milestones.find((m) => m.id === task.milestoneId)?.name;

  return (
    <div className={layout === 'rail' ? 'prop-rail' : 'prop-grid'}>
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
              options={[{ id: '', label: 'No milestone' }, ...milestones.map((m) => ({ id: m.id, label: m.name }))]}
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
              <Ic.calendar size={13} />{' '}
              {task.dueDate ? fmtDate(task.dueDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set date'}
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
  );
}

/** Sub-tasks block with progress, rows, and inline add. Root tasks only. */
export function TaskSubtasks({
  detail,
  onOpenTask,
  toggleChild,
  addChild,
}: {
  detail: TaskDetail;
  onOpenTask: (t: OpenableTask) => void;
  toggleChild: (childId: string) => void;
  addChild: (title: string) => Promise<boolean | undefined>;
}) {
  const { task, children } = detail;
  if (task.parentId) return null;
  const subDone = children.filter((c) => c.done).length;

  return (
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
        <SubRow key={c.id} child={c} onOpen={() => onOpenTask(c)} onToggle={() => toggleChild(c.id)} />
      ))}
      <InlineSubAdd onAdd={addChild} />
    </div>
  );
}

/** One activity-log entry — read-only by default, edit-in-place on demand. */
function CommentRow({
  comment,
  editComment,
}: {
  comment: TaskDetail['comments'][number];
  editComment: (commentId: string, body: string) => Promise<boolean | undefined>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="act-item">
      <span className="act-day">{fmtDay(comment.createdAt)}</span>
      <div className="act-body">
        {editing ? (
          <CommentEditor
            value={comment.body}
            onSave={async (body) => {
              // Leave edit mode only on a successful save; a failure keeps the
              // editor open (with the toast) so the edit isn't silently dropped.
              if (await editComment(comment.id, body)) setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {/* Click the text to edit in place (blur saves, Esc cancels). The
                link guard lets clickable links in a comment open normally. */}
            <div
              className="act-text-edit"
              tabIndex={0}
              aria-label="Edit comment"
              title="Click to edit"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('a')) setEditing(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setEditing(true);
                }
              }}
            >
              <MarkdownView value={comment.body} className="act-text" />
            </div>
            {(comment.author?.role === 'agent' || comment.source !== 'web' || comment.editedAt) && (
              <div className="act-meta">
                {comment.author?.role === 'agent' && (
                  <span className="act-src" data-src="agent">
                    Agent
                  </span>
                )}
                {comment.author?.role !== 'agent' && comment.source !== 'web' && (
                  <span className="act-src" data-src={comment.source === 'mcp' ? 'agent' : comment.source}>
                    {comment.source}
                  </span>
                )}
                {comment.editedAt && <span className="act-edited">edited</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Activity log (edit-in-place) + comment composer. */
export function TaskActivity({
  comments,
  addComment,
  editComment,
}: {
  comments: TaskDetail['comments'];
  addComment: (body: string) => Promise<boolean | undefined>;
  editComment: (commentId: string, body: string) => Promise<boolean | undefined>;
}) {
  return (
    <div className="activity">
      <p className="dp-section-label">Activity</p>
      {comments.map((c) => (
        <CommentRow key={c.id} comment={c} editComment={editComment} />
      ))}
      <CommentComposer onSend={addComment} />
    </div>
  );
}

/**
 * Convert a sub-task into a standalone task, with an inline confirm. Render only
 * for sub-tasks. Detaching keeps the ref, every attribute, and the comment
 * timeline — it just lifts the task to the top level. The confirm guards it
 * because there's no one-click "re-attach" in the UI to undo an accidental click.
 */
export function ConvertToTaskControl({ onConvert }: { onConvert: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span className="convert-confirm">
        Make this a standalone task?
        <button className="yes" onClick={onConvert}>
          Convert
        </button>
        <button className="no" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      className="convert-btn"
      type="button"
      onClick={() => setConfirm(true)}
      title="Detach this sub-task into a standalone task — keeps its ref, attributes, and comments"
    >
      <Ic.arrowUp size={15} /> Convert to task
    </button>
  );
}

/** Delete control with inline confirm. Navigation after delete is the caller's. */
export function DeleteControl({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirmDel, setConfirmDel] = useState(false);
  if (confirmDel) {
    return (
      <span className="del-confirm">
        Delete this task?
        <button className="yes" onClick={onDelete}>
          Delete
        </button>
        <button className="no" onClick={() => setConfirmDel(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button className="del-btn" type="button" onClick={() => setConfirmDel(true)}>
      <Ic.trash size={15} /> Delete task
    </button>
  );
}
