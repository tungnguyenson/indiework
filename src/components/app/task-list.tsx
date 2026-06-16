'use client';

import { startTransition, useCallback, useLayoutEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { TaskDto } from '@/server/services';
import {
  buildSections,
  computeAvailDims,
  DEFAULT_FILTERS,
  DEFAULT_BOARD_CFG,
  type GroupDim,
  type GroupStyle,
  type Filters,
  type FieldVis,
  type BoardCfg,
  type Section as Sec,
  type GroupModule,
  type GroupMilestone,
} from '@/lib/grouping';
import { fmtDate } from '@/lib/dates';
import {
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_PRIORITY,
  TASK_PRIORITY_LABEL,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';
import { DEFAULT_VIEW, viewAllowsStatus, viewCaptureStatus, useViews, type ViewId } from '@/lib/views';
import { useLocalStorage } from '@/lib/use-local-storage';
import { applyTaskOptimistic } from '@/lib/optimistic';
import { useTaskNav, useOpenTaskKey, taskKey } from '@/lib/task-nav';
import { createTask, updateTask, toggleTaskDone, bulkUpdateTasks, bulkDeleteTasks } from '@/app/_actions/tasks';
import { ProjectTabs } from './project-tabs';
import { DisplayPopover, FilterPopover, BoardDisplayPopover } from './display-popover';
import { BoardView } from './board';
import { TaskRow } from './task-row';
import { QuickCapture } from './quick-capture';
import { Progress, PriorityBars, ModuleIcon } from '@/components/ui/bits';
import { Popover, OptionList } from '@/components/ui/popover';
import { Ic } from '@/components/ui/icons';

// Opening a task navigates to /issue/<ref>/<slug>, which remounts this view.
// Scroll position is kept in-memory (per project) so the list doesn't jump to
// the top behind the panel; collapsed sections persist via localStorage below.
const scrollPositions = new Map<string, number>();

interface Project {
  id: string;
  key: string;
  name: string;
  emoji: string | null;
  pinned: boolean;
}

interface DisplayState {
  groupBy: GroupDim;
  subGroupBy: GroupDim;
  groupStyle: GroupStyle;
  filters: Filters;
  statusOrder: TaskStatus[];
  statusHidden: TaskStatus[];
}

export function ProjectView({
  project,
  modules,
  milestones,
  tasks,
}: {
  project: Project;
  modules: GroupModule[];
  milestones: GroupMilestone[];
  tasks: TaskDto[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { openTask } = useTaskNav();
  const openKey = useOpenTaskKey();
  const activeView = (params.get('view') as ViewId) || DEFAULT_VIEW;

  const views = useViews(project.key);
  const mode = views.modeFor(activeView);

  const availDims = useMemo(() => computeAvailDims(modules, milestones), [modules, milestones]);
  const [disp, setDisp] = useLocalStorage<DisplayState>(`iw-display-${project.key}`, {
    groupBy: availDims[0] ?? 'status',
    subGroupBy: 'none',
    groupStyle: 'band',
    filters: DEFAULT_FILTERS,
    statusOrder: [],
    statusHidden: [],
  });
  const filters = disp.filters;
  const [boardCfg, setBoardCfg] = useLocalStorage<BoardCfg>(`iw-board-${project.key}`, DEFAULT_BOARD_CFG);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Persisted per project (Set isn't JSON-serializable, so store string[] and
  // derive the Set) — survives the remount that opening a task triggers.
  const [collapsedArr, setCollapsedArr] = useLocalStorage<string[]>(`iw-collapsed-${project.key}`, []);
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr]);
  const lastSel = useRef<string | null>(null);

  // Restore/keep list scroll across the open-task remount.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = scrollPositions.get(project.key) ?? 0;
  }, [project.key]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) scrollPositions.set(project.key, el.scrollTop);
  };

  const allowedStatus = useCallback((s: TaskStatus) => viewAllowsStatus(activeView, s), [activeView]);

  // Optimistic mirror of the server `tasks` prop: drag/checkbox/bulk edits paint
  // instantly, then reconcile when the action's revalidatePath re-flows real data.
  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, applyTaskOptimistic);

  // Sub-tasks are tasks with a parentId — list/board/grouping use root tasks only;
  // children are surfaced via childrenMap (row pill + inline checklist) and the panel.
  const rootTasks = useMemo(() => optimisticTasks.filter((t) => !t.parentId), [optimisticTasks]);
  const childrenMap = useMemo(() => {
    const m = new Map<string, TaskDto[]>();
    for (const t of optimisticTasks) {
      if (!t.parentId) continue;
      const arr = m.get(t.parentId) ?? [];
      arr.push(t);
      m.set(t.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return m;
  }, [optimisticTasks]);

  const effPrimary = availDims.includes(disp.groupBy) || disp.groupBy === 'none' ? disp.groupBy : availDims[0] ?? 'status';
  const effSecondary =
    disp.subGroupBy !== 'none' && disp.subGroupBy !== effPrimary && availDims.includes(disp.subGroupBy) ? disp.subGroupBy : 'none';

  const scoped = useMemo(() => rootTasks.filter((t) => allowedStatus(t.status)), [rootTasks, allowedStatus]);

  const sections = useMemo(
    () => buildSections(rootTasks, effPrimary, effSecondary, filters, modules, milestones, {
      statusOrder: disp.statusOrder,
      statusHidden: disp.statusHidden,
      allowedStatus,
    }),
    [rootTasks, effPrimary, effSecondary, filters, modules, milestones, disp.statusOrder, disp.statusHidden, allowedStatus],
  );
  const visibleSections = sections.filter((s) => s.tasks.length > 0 || s.keep);
  const anyTasks = sections.some((s) => s.tasks.length > 0);

  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const milestoneMap = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const orderedIds = useMemo(
    () => visibleSections.flatMap((s) => (s.subs ? s.subs.flatMap((x) => x.tasks) : s.tasks).map((t) => t.id)),
    [visibleSections],
  );

  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastSel.current;
        if (shift && anchor && orderedIds.includes(anchor)) {
          const a = orderedIds.indexOf(anchor);
          const b = orderedIds.indexOf(id);
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastSel.current = id;
    },
    [orderedIds],
  );

  const toggleCollapse = (key: string) =>
    setCollapsedArr((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const add = async (title: string, patch: Sec['patch'] = {}) => {
    const captureStatus = viewCaptureStatus(activeView);
    const task = await createTask({ projectId: project.id, title, ...(captureStatus ? { status: captureStatus } : {}), ...patch });
    router.refresh();
    return task;
  };
  // IW-8: adding inside a section opens the new task's detail panel; the top
  // quick-capture stays put so rapid dumping isn't interrupted.
  const addAndOpen = async (title: string, patch: Sec['patch'] = {}) => {
    const task = await add(title, patch);
    if (task) openTask(task);
  };
  const onRename = useCallback(
    (id: string, title: string) => {
      // Let an open detail panel for this task reflect the rename immediately.
      window.dispatchEvent(new CustomEvent('iw:task-updated', { detail: { id, patch: { title } } }));
      startTransition(async () => {
        applyOptimistic({ kind: 'patch', ids: [id], patch: { title } });
        await updateTask(id, { title });
      });
    },
    [applyOptimistic],
  );
  const onToggleDone = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ kind: 'toggleDone', id });
      await toggleTaskDone(id);
    });
  };

  const clearSel = () => {
    setSelected(new Set());
    lastSel.current = null;
  };
  const selMode = selected.size > 0;

  return (
    <>
      <ProjectTabs
        project={project}
        activeView={activeView}
        customViews={views.customViews}
        onAddView={views.addView}
        onRenameView={views.renameView}
        onRemoveView={views.removeView}
        modeFor={views.modeFor}
        right={
          <>
            <FilterPopover filters={filters} setFilters={(f) => setDisp((s) => ({ ...s, filters: f }))} />
            {mode === 'board' ? (
              <BoardDisplayPopover
                setMode={(m) => views.setMode(activeView, m)}
                availDims={availDims}
                cfg={boardCfg}
                setCfg={(patch) => setBoardCfg((c) => ({ ...c, ...patch }))}
              />
            ) : (
              <DisplayPopover
                mode={mode}
                setMode={(m) => views.setMode(activeView, m)}
                groupBy={effPrimary}
                setGroupBy={(d) => setDisp((s) => ({ ...s, groupBy: d }))}
                subGroupBy={effSecondary}
                setSubGroupBy={(d) => setDisp((s) => ({ ...s, subGroupBy: d }))}
                groupStyle={disp.groupStyle ?? 'band'}
                setGroupStyle={(g) => setDisp((s) => ({ ...s, groupStyle: g }))}
                availDims={availDims}
                filters={filters}
                setFilters={(f) => setDisp((s) => ({ ...s, filters: f }))}
                statusOrder={disp.statusOrder}
                setStatusOrder={(o) => setDisp((s) => ({ ...s, statusOrder: o }))}
                statusHidden={disp.statusHidden}
                setStatusHidden={(h) => setDisp((s) => ({ ...s, statusHidden: h }))}
              />
            )}
          </>
        }
      />
      <QuickCapture placeholder="Add a task…  (it lands in this project)" onAdd={(t) => void add(t)} />

      {mode === 'board' ? (
        <BoardView project={project} modules={modules} milestones={milestones} tasks={scoped} cfg={boardCfg} />
      ) : (
        <div className="scroll-body" data-group-style={disp.groupStyle ?? 'band'} ref={scrollRef} onScroll={onScroll}>
          {anyTasks ? (
            visibleSections.map((section) => (
              <Section
                key={section.id}
                section={section}
                collapsed={collapsed.has(section.id)}
                onToggleCollapse={() => toggleCollapse(section.id)}
                moduleMap={moduleMap}
                milestoneMap={milestoneMap}
                childrenMap={childrenMap}
                showSubtasks={filters.showSubtasks}
                fields={filters.fields}
                showModule={effPrimary !== 'module' && effSecondary !== 'module'}
                showMilestone={effPrimary !== 'milestone' && effSecondary !== 'milestone'}
                openKey={openKey}
                selected={selected}
                selMode={selMode}
                onOpen={openTask}
                onRename={onRename}
                onToggleDone={onToggleDone}
                onToggleSelect={toggleSelect}
                collapsedSet={collapsed}
                toggleCollapse={toggleCollapse}
                onAdd={addAndOpen}
              />
            ))
          ) : (
            <div className="empty">
              <div className="empty-emoji">🍃</div>
              <h3>Nothing here yet</h3>
              <p>
                {filters.status.length || filters.priority.length || filters.hideDone
                  ? 'No tasks match the current filters.'
                  : 'Add your first task in the box above, or press c anywhere.'}
              </p>
            </div>
          )}
        </div>
      )}

      {selMode && (
        <BulkBar
          count={selected.size}
          onSetStatus={(status) => {
            const ids = [...selected];
            clearSel();
            startTransition(async () => {
              applyOptimistic({ kind: 'patch', ids, patch: { status } });
              await bulkUpdateTasks(ids, { status });
            });
          }}
          onSetPriority={(priority) => {
            const ids = [...selected];
            clearSel();
            startTransition(async () => {
              applyOptimistic({ kind: 'patch', ids, patch: { priority } });
              await bulkUpdateTasks(ids, { priority });
            });
          }}
          onMarkDone={() => {
            const ids = [...selected];
            clearSel();
            startTransition(async () => {
              applyOptimistic({ kind: 'patch', ids, patch: { status: 'done' } });
              await bulkUpdateTasks(ids, { status: 'done' });
            });
          }}
          onDelete={() => {
            const ids = [...selected];
            clearSel();
            startTransition(async () => {
              applyOptimistic({ kind: 'remove', ids });
              await bulkDeleteTasks(ids);
            });
          }}
          onClear={clearSel}
        />
      )}
    </>
  );
}

function SectionHeadIcon({ section }: { section: Sec }) {
  if (section.modIcon) return <ModuleIcon icon={section.modIcon} color={section.color} size={15} />;
  if (section.icon === 'cube') return <Ic.cube size={15} />;
  if (section.icon === 'target') return <Ic.target size={15} />;
  if (section.icon === 'flag') return <Ic.flag size={15} />;
  return <span className="section-dot" style={{ background: section.color ?? 'var(--text-faint)' }} />;
}

function Section({
  section,
  collapsed,
  onToggleCollapse,
  moduleMap,
  milestoneMap,
  childrenMap,
  showSubtasks,
  fields,
  showModule,
  showMilestone,
  openKey,
  selected,
  selMode,
  onOpen,
  onRename,
  onToggleDone,
  onToggleSelect,
  collapsedSet,
  toggleCollapse,
  onAdd,
}: {
  section: Sec;
  collapsed: boolean;
  onToggleCollapse: () => void;
  moduleMap: Map<string, GroupModule>;
  milestoneMap: Map<string, GroupMilestone>;
  childrenMap: Map<string, TaskDto[]>;
  showSubtasks: boolean;
  fields: FieldVis;
  showModule: boolean;
  showMilestone: boolean;
  openKey: string | null;
  selected: Set<string>;
  selMode: boolean;
  onOpen: (task: TaskDto) => void;
  onRename: (id: string, title: string) => void;
  onToggleDone: (id: string) => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  collapsedSet: Set<string>;
  toggleCollapse: (key: string) => void;
  onAdd: (title: string, patch: Sec['patch']) => void;
}) {
  const total = section.tasks.length;
  const done = section.tasks.filter((t) => t.done).length;

  const renderRow = (t: TaskDto) => (
    <TaskRow
      key={t.id}
      task={t}
      module={t.moduleId ? moduleMap.get(t.moduleId) : undefined}
      milestone={t.milestoneId ? milestoneMap.get(t.milestoneId) : undefined}
      selected={openKey === taskKey(t)}
      checked={selected.has(t.id)}
      selMode={selMode}
      fields={fields}
      childTasks={childrenMap.get(t.id)}
      showSubtasks={showSubtasks}
      openKey={openKey}
      onToggleDone={onToggleDone}
      onOpen={onOpen}
      onRename={onRename}
      onToggleSelect={(shift) => onToggleSelect(t.id, shift)}
      showModule={showModule}
      showMilestone={showMilestone}
    />
  );

  return (
    <div className="section">
      <div className="section-head" onClick={onToggleCollapse}>
        <span className="section-caret" data-collapsed={collapsed ? '' : undefined}>
          <Ic.chevronDown size={15} />
        </span>
        <SectionHeadIcon section={section} />
        <span className="section-name">{section.name}</span>
        <span className="section-count">{total}</span>
        {section.target && (
          <span className="section-target">
            <Ic.calendar size={12} /> {fmtDate(section.target)}
          </span>
        )}
        {total > 0 && (
          <span className="section-prog">
            {done} / {total} done
            <Progress value={done / total} tone={done === total ? 'done' : 'accent'} />
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {section.subs ? (
            section.subs.map((sub) => {
              const subCollapsed = collapsedSet.has(sub.id);
              return (
                <div className="subsection" key={sub.id}>
                  <div className="subsection-head" onClick={() => toggleCollapse(sub.id)}>
                    <span className="section-caret" data-collapsed={subCollapsed ? '' : undefined}>
                      <Ic.chevronDown size={13} />
                    </span>
                    {sub.modIcon ? (
                      <span className="subsection-icon">
                        <ModuleIcon icon={sub.modIcon} color={sub.color} size={13} />
                      </span>
                    ) : sub.color ? (
                      <span className="section-dot sub" style={{ background: sub.color }} />
                    ) : (
                      <span className="subsection-icon">
                        <SectionHeadIcon section={sub} />
                      </span>
                    )}
                    <span className="subsection-name">{sub.name}</span>
                    <span className="section-count">{sub.tasks.length}</span>
                  </div>
                  {!subCollapsed && sub.tasks.map(renderRow)}
                </div>
              );
            })
          ) : (
            <>{section.tasks.map(renderRow)}</>
          )}
          <InlineAdd onAdd={(title) => onAdd(title, section.patch)} />
        </>
      )}
    </div>
  );
}

function InlineAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  if (!editing) {
    return (
      <button className="row-add" type="button" onClick={() => setEditing(true)}>
        <Ic.plus size={14} /> Add task
      </button>
    );
  }
  const submit = () => {
    const t = v.trim();
    if (t) onAdd(t);
    setV('');
  };
  return (
    <div className="row-add">
      <Ic.plus size={14} />
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Task title…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => !v.trim() && setEditing(false)}
      />
    </div>
  );
}

function BulkBar({
  count,
  onSetStatus,
  onSetPriority,
  onMarkDone,
  onDelete,
  onClear,
}: {
  count: number;
  onSetStatus: (s: TaskStatus) => void;
  onSetPriority: (p: TaskPriority) => void;
  onMarkDone: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="bulkbar">
      <span className="bulkbar-count">
        <b>{count}</b> selected
      </span>
      <span className="bulkbar-sep" />
      <Popover
        width={190}
        trigger={
          <button className="bulkbar-btn" type="button">
            <Ic.dots size={15} /> Status
          </button>
        }
      >
        {(close) => (
          <OptionList
            options={TASK_STATUS.map((s) => ({ id: s, label: TASK_STATUS_LABEL[s] }))}
            onPick={(id) => {
              onSetStatus(id as TaskStatus);
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
      <Popover
        width={170}
        trigger={
          <button className="bulkbar-btn" type="button">
            <Ic.flag size={15} /> Priority
          </button>
        }
      >
        {(close) => (
          <OptionList
            options={TASK_PRIORITY.map((p) => ({ id: p, label: TASK_PRIORITY_LABEL[p] }))}
            onPick={(id) => {
              onSetPriority(id as TaskPriority);
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
      <button className="bulkbar-btn" type="button" onClick={onMarkDone}>
        <Ic.check size={15} /> Done
      </button>
      <button className="bulkbar-btn danger" type="button" onClick={onDelete}>
        <Ic.trash size={15} /> Delete
      </button>
      <span className="bulkbar-sep" />
      <button className="bulkbar-x" type="button" onClick={onClear} aria-label="Clear selection">
        <Ic.close size={16} />
      </button>
    </div>
  );
}
