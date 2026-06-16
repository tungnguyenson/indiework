'use client';

import { useState } from 'react';
import type { TaskDto } from '@/server/services';
import type { GroupModule, GroupMilestone, FieldVis } from '@/lib/grouping';
import { taskKey } from '@/lib/task-nav';
import { CircleCheck } from '@/components/ui/interactive';
import { PriorityBars, ModuleTag, MilestoneTag, DuePill, StatusChip } from '@/components/ui/bits';
import { Ic } from '@/components/ui/icons';

export function TaskRow({
  task,
  module,
  milestone,
  selected,
  checked,
  selMode,
  fields,
  childTasks,
  showSubtasks,
  openKey,
  onToggleDone,
  onOpen,
  onRename,
  onToggleSelect,
  showModule = true,
  showMilestone = true,
}: {
  task: TaskDto;
  module?: GroupModule;
  milestone?: GroupMilestone;
  selected: boolean;
  checked: boolean;
  selMode: boolean;
  fields: FieldVis;
  childTasks?: TaskDto[];
  showSubtasks?: boolean;
  openKey?: string | null;
  onToggleDone: (id: string) => void;
  onOpen: (task: TaskDto) => void;
  onRename: (id: string, title: string) => void;
  onToggleSelect: (shift: boolean) => void;
  showModule?: boolean;
  showMilestone?: boolean;
}) {
  const children = childTasks ?? [];
  const subDone = children.filter((c) => c.done).length;
  const hasChildren = children.length > 0;
  const allDone = hasChildren && subDone === children.length;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(task.title);
    setEditing(true);
  };
  const commitEdit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== task.title) onRename(task.id, t);
  };

  return (
    <>
      <div
        className="task-row"
        data-done={task.done ? '' : undefined}
        data-cancelled={task.status === 'cancelled' ? '' : undefined}
        data-selected={selected ? '' : undefined}
        data-checked={checked ? '' : undefined}
        data-selmode={selMode ? '' : undefined}
        data-editing={editing ? '' : undefined}
        onClick={() => !editing && onOpen(task)}
      >
        <button
          className="task-select"
          type="button"
          aria-label="Select task"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
        >
          {checked && <Ic.check size={11} strokeWidth={2.6} />}
        </button>

        {/* Leading priority + ref columns — always visible, kept in flow so the
            status circle and titles line up across every row (matches design). */}
        {fields.priority && (
          <span className="task-lead-pri">
            <PriorityBars priority={task.priority} />
          </span>
        )}
        {fields.taskId && task.ref && <span className="task-ref task-ref-lead">{task.ref}</span>}

        <CircleCheck done={task.done} status={task.status} onToggle={() => onToggleDone(task.id)} />

        <div className="task-main">
          <div className="task-line">
            {editing ? (
              <input
                className="task-title-input"
                autoFocus
                value={draft}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    commitEdit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
                onBlur={commitEdit}
              />
            ) : (
              <>
                <span className="task-title">{task.title}</span>
                <button
                  className="task-title-edit task-reveal"
                  type="button"
                  aria-label="Rename task"
                  title="Rename"
                  onClick={startEdit}
                >
                  <Ic.edit size={12} />
                </button>
              </>
            )}
          </div>
          {task.status === 'pending' && task.statusNote && (
            <div className="task-note-2nd">
              <Ic.bolt size={12} />
              <span>{task.statusNote}</span>
            </div>
          )}
        </div>

        {/* Right meta stays visible (subtask · attachments · tags · due);
            only the status chip is hover-revealed via status-reveal. */}
        <div className="task-meta">
          {hasChildren && (
            <span
              className="subtask-count"
              data-complete={allDone ? '' : undefined}
              title={`${subDone} of ${children.length} sub-tasks done`}
            >
              <Ic.listTree size={12} /> {subDone}/{children.length}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="attach-count" title={`${task.attachmentCount} attachment${task.attachmentCount === 1 ? '' : 's'}`}>
              <Ic.paperclip size={12} /> {task.attachmentCount}
            </span>
          )}
          {fields.module && showModule && module && <ModuleTag name={module.name} color={module.color} icon={module.icon} />}
          {fields.milestone && showMilestone && milestone && <MilestoneTag name={milestone.name} />}
          {task.dueDate && <DuePill due={task.dueDate} />}
          {fields.status && (
            <span className="task-reveal status-reveal">
              <StatusChip status={task.status} size="sm" />
            </span>
          )}
        </div>
      </div>

      {showSubtasks && hasChildren && (
        <div className="subtask-list">
          {children.map((c) => (
            <div
              key={c.id}
              className="subtask-row"
              data-done={c.done ? '' : undefined}
              data-selected={openKey === taskKey(c) ? '' : undefined}
              onClick={() => onOpen(c)}
            >
              <button
                className="subtask-check"
                type="button"
                data-done={c.done ? '' : undefined}
                aria-label={c.done ? 'Mark not done' : 'Mark done'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDone(c.id);
                }}
              >
                {c.done && <Ic.check size={9} strokeWidth={3} />}
              </button>
              <span className="subtask-title">{c.title}</span>
              {c.ref && <span className="subtask-ref">{c.ref}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
