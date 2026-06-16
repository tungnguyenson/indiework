'use client';

import { startTransition, useMemo, useOptimistic, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskDto } from '@/server/services';
import {
  boardBuckets,
  sortBoardCards,
  type BoardCfg,
  type BoardBucket,
  type GroupModule,
  type GroupMilestone,
  type NewTaskPatch,
  type FieldVis,
} from '@/lib/grouping';
import { applyTaskOptimistic } from '@/lib/optimistic';
import { useTaskNav } from '@/lib/task-nav';
import { createTask, updateTask } from '@/app/_actions/tasks';
import { PriorityBars, ModuleTag, MilestoneTag, ModuleIcon, StatusChip } from '@/components/ui/bits';
import { Ic } from '@/components/ui/icons';

interface Project {
  id: string;
  key: string;
  name: string;
  emoji: string | null;
}

/** Configurable board (v3): columns + optional swimlane rows, driven by boardCfg. */
export function BoardView({
  project,
  modules,
  milestones,
  tasks,
  cfg,
}: {
  project: Project;
  modules: GroupModule[];
  milestones: GroupMilestone[];
  tasks: TaskDto[];
  cfg: BoardCfg;
}) {
  const router = useRouter();
  const { openTask } = useTaskNav();
  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, applyTaskOptimistic);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const milestoneMap = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const cols = useMemo(() => boardBuckets(cfg.columns, modules, milestones), [cfg.columns, modules, milestones]);
  const rows = useMemo<BoardBucket[] | null>(
    () => (cfg.rows === 'none' ? null : boardBuckets(cfg.rows, modules, milestones)),
    [cfg.rows, modules, milestones],
  );

  const visible = useMemo(
    () => (cfg.hideDone ? optimisticTasks.filter((t) => !t.done && t.status !== 'cancelled') : optimisticTasks),
    [optimisticTasks, cfg.hideDone],
  );
  const sortFn = sortBoardCards(cfg.ordering);

  const drop = (e: React.DragEvent, patch: NewTaskPatch) => {
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    setOverKey(null);
    if (!id) return;
    // Move the card now; the action's revalidatePath re-flows the real data after.
    startTransition(async () => {
      applyOptimistic({ kind: 'patch', ids: [id], patch });
      await updateTask(id, patch);
    });
  };

  const addTo = async (patch: NewTaskPatch, title: string) => {
    // Create needs a server-generated id/ref, so it stays non-optimistic (see ADR 0002).
    await createTask({ projectId: project.id, title, ...patch });
    router.refresh();
  };

  const renderColumn = (col: BoardBucket, rowPatch: NewTaskPatch, laneKey: string, list: TaskDto[]) => {
    const cellKey = `${laneKey}:${col.key}`;
    const patch = { ...rowPatch, ...col.patch };
    return (
      <div
        key={col.key}
        className="board-col"
        data-over={overKey === cellKey ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOverKey(cellKey);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setOverKey(null);
        }}
        onDrop={(e) => drop(e, patch)}
      >
        <div className="board-col-head">
          {col.modIcon ? (
            <ModuleIcon icon={col.modIcon} color={col.color} size={14} />
          ) : (
            <span className="dot" style={{ background: col.color ?? 'var(--text-faint)' }} />
          )}
          <span className="board-col-name">{col.name}</span>
          <span className="board-col-count">{list.length}</span>
        </div>
        <div className="board-list">
          {list.map((t) => (
            <BoardCard
              key={t.id}
              task={t}
              fields={cfg.fields}
              module={t.moduleId ? moduleMap.get(t.moduleId) : undefined}
              milestone={t.milestoneId ? milestoneMap.get(t.milestoneId) : undefined}
              dragging={dragId === t.id}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', t.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(t.id);
              }}
              onDragEnd={() => setDragId(null)}
              onOpen={() => openTask(t)}
            />
          ))}
        </div>
        <BoardAdd onAdd={(title) => addTo(patch, title)} />
      </div>
    );
  };

  const colsFor = (laneTasks: TaskDto[], rowPatch: NewTaskPatch, laneKey: string) =>
    cols
      .map((col) => ({ col, list: laneTasks.filter(col.match).sort(sortFn) }))
      .filter(({ list }) => cfg.showEmpty || list.length > 0)
      .map(({ col, list }) => renderColumn(col, rowPatch, laneKey, list));

  if (!rows) {
    return <div className="board">{colsFor(visible, {}, '_')}</div>;
  }

  const lanes = rows
    .map((row) => ({ row, laneTasks: visible.filter(row.match) }))
    .filter(({ laneTasks }) => cfg.showEmpty || laneTasks.length > 0);

  return (
    <div className="board-swims">
      {lanes.map(({ row, laneTasks }) => (
        <div className="board-swim" key={row.key}>
          <div className="board-swim-head">
            {row.modIcon ? <ModuleIcon icon={row.modIcon} color={row.color} size={14} /> : <span className="dot" style={{ background: row.color ?? 'var(--text-faint)' }} />}
            <span className="board-swim-name">{row.name}</span>
            <span className="board-col-count">{laneTasks.length}</span>
          </div>
          <div className="board">{colsFor(laneTasks, row.patch, row.key)}</div>
        </div>
      ))}
    </div>
  );
}

function BoardCard({
  task,
  fields,
  module,
  milestone,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  task: TaskDto;
  fields: FieldVis;
  module?: GroupModule;
  milestone?: GroupMilestone;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const hasMeta =
    (fields.status && true) ||
    fields.priority ||
    (fields.module && module) ||
    (fields.milestone && milestone) ||
    (fields.taskId && task.ref);
  return (
    <div className="board-card" draggable data-dragging={dragging ? '' : undefined} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      <div className="board-card-title">{task.title}</div>
      {hasMeta && (
        <div className="board-card-meta">
          {fields.status && <StatusChip status={task.status} size="sm" />}
          {fields.priority && <PriorityBars priority={task.priority} />}
          {fields.module && module && <ModuleTag name={module.name} color={module.color} icon={module.icon} />}
          {fields.milestone && milestone && <MilestoneTag name={milestone.name} />}
          {fields.taskId && task.ref && <span className="task-ref">{task.ref}</span>}
        </div>
      )}
    </div>
  );
}

function BoardAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  if (!editing) {
    return (
      <button className="board-add" type="button" onClick={() => setEditing(true)}>
        <Ic.plus size={15} /> Add
      </button>
    );
  }
  const submit = () => {
    const t = v.trim();
    if (t) onAdd(t);
    setV('');
  };
  return (
    <div className="board-add">
      <Ic.plus size={15} />
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Card title…"
        style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 13, color: 'var(--text-strong)' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => !v.trim() && setEditing(false)}
      />
    </div>
  );
}
