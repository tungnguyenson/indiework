'use client';

import { useState } from 'react';
import { Popover } from '@/components/ui/popover';
import { PriorityBars, ModuleIcon } from '@/components/ui/bits';
import { Ic } from '@/components/ui/icons';
import {
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_PRIORITY,
  TASK_PRIORITY_LABEL,
  DEFAULT_STATUS_ORDER,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';
import type { GroupDim, GroupStyle, Filters, FieldVis, BoardCfg, BoardOrdering, TaskOrdering, GroupModule, GroupMilestone } from '@/lib/grouping';
import type { ViewMode } from '@/lib/views';

const DIM_LABEL: Record<GroupDim, string> = {
  module: 'Module',
  milestone: 'Milestone',
  status: 'Status',
  priority: 'Priority',
  none: 'None',
};

type FieldKey = keyof FieldVis;
const FIELD_ROWS: { key: FieldKey; label: string }[] = [
  { key: 'taskId', label: 'Task ID' },
  { key: 'priority', label: 'Priority' },
  { key: 'module', label: 'Module' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'status', label: 'Status' },
];

function fieldExample(key: FieldKey) {
  switch (key) {
    case 'taskId':
      return <span className="task-ref">DISK-12</span>;
    case 'priority':
      return <PriorityBars priority="high" />;
    case 'module':
      return <ModuleIcon icon="cube" color="#4C8DFF" size={13} />;
    case 'milestone':
      return <Ic.target size={13} />;
    case 'status':
      return <span className="dot" style={{ background: 'var(--st-in_progress)' }} />;
  }
}

export interface DisplayProps {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  groupBy: GroupDim;
  setGroupBy: (d: GroupDim) => void;
  subGroupBy: GroupDim;
  setSubGroupBy: (d: GroupDim) => void;
  groupStyle: GroupStyle;
  setGroupStyle: (g: GroupStyle) => void;
  sort: TaskOrdering;
  setSort: (o: TaskOrdering) => void;
  availDims: GroupDim[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  statusOrder: TaskStatus[];
  setStatusOrder: (o: TaskStatus[]) => void;
  statusHidden: TaskStatus[];
  setStatusHidden: (h: TaskStatus[]) => void;
}

export function DisplayPopover(props: DisplayProps) {
  const { groupBy, subGroupBy, groupStyle, sort, availDims, filters, statusHidden } = props;
  const dirty =
    groupBy !== (availDims[0] ?? 'status') ||
    subGroupBy !== 'none' ||
    groupStyle !== 'band' ||
    sort !== 'priority' ||
    filters.hideDone ||
    filters.showSubtasks ||
    statusHidden.length > 0 ||
    !filters.fields.taskId ||
    filters.fields.status;

  return (
    <Popover
      align="right"
      width={300}
      trigger={
        <button className="icon-tool" data-on={dirty ? '' : undefined} type="button" aria-label="Display options">
          <Ic.sliders size={16} />
          {dirty && <span className="tool-dot" />}
        </button>
      }
    >
      <DisplayBody {...props} />
    </Popover>
  );
}

function DisplayBody(props: DisplayProps) {
  const [screen, setScreen] = useState<'main' | 'order'>('main');
  const { mode, setMode, groupBy, setGroupBy, subGroupBy, setSubGroupBy, groupStyle, setGroupStyle, sort, setSort, availDims, filters, setFilters } = props;

  if (screen === 'order') {
    return <GroupOrder {...props} onBack={() => setScreen('main')} />;
  }

  const setField = (key: FieldKey) =>
    setFilters({ ...filters, fields: { ...filters.fields, [key]: !filters.fields[key] } });

  return (
    <div className="display-pop">
      <div className="dp-row">
        <span className="dp-row-lbl">View</span>
        <div className="seg-wrap">
          <button className="seg-btn" data-active={mode === 'list' ? '' : undefined} onClick={() => setMode('list')} type="button">
            <Ic.list size={14} /> List
          </button>
          <button className="seg-btn" data-active={mode === 'board' ? '' : undefined} onClick={() => setMode('board')} type="button">
            <Ic.board size={14} /> Board
          </button>
        </div>
      </div>

      {mode === 'list' && (
        <>
          <div className="dp-divider" />
          <div className="dp-row">
            <span className="dp-row-lbl">Grouping</span>
            <select className="dp-dd" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupDim)}>
              {[...availDims, 'none' as GroupDim].map((d) => (
                <option key={d} value={d}>
                  {DIM_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="dp-row">
            <span className="dp-row-lbl">Sub-grouping</span>
            <select className="dp-dd" value={subGroupBy} onChange={(e) => setSubGroupBy(e.target.value as GroupDim)}>
              {['none' as GroupDim, ...availDims.filter((d) => d !== groupBy)].map((d) => (
                <option key={d} value={d}>
                  {DIM_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="dp-row">
            <span className="dp-row-lbl">Sort</span>
            <select className="dp-dd" value={sort} onChange={(e) => setSort(e.target.value as TaskOrdering)}>
              {(Object.keys(ORDERING_LABEL) as TaskOrdering[]).map((o) => (
                <option key={o} value={o}>
                  {ORDERING_LABEL[o]}
                </option>
              ))}
            </select>
          </div>
          {groupBy !== 'none' && (
            <div className="dp-row">
              <span className="dp-row-lbl">Group header</span>
              <div className="seg-wrap">
                <button className="seg-btn" data-active={groupStyle === 'band' ? '' : undefined} onClick={() => setGroupStyle('band')} type="button">
                  Band
                </button>
                <button className="seg-btn" data-active={groupStyle === 'rule' ? '' : undefined} onClick={() => setGroupStyle('rule')} type="button">
                  Rule
                </button>
              </div>
            </div>
          )}
          {groupBy === 'status' && (
            <button className="dp-back" style={{ padding: '2px 4px' }} onClick={() => setScreen('order')} type="button">
              Group ordering <Ic.chevronRight size={14} style={{ marginLeft: 'auto' }} />
            </button>
          )}

          <div className="dp-divider" />
          <button className="dp-toggle" type="button" onClick={() => setFilters({ ...filters, showSubtasks: !filters.showSubtasks })}>
            <Ic.list size={15} /> Show sub-tasks
            <span className="dp-switch" data-on={filters.showSubtasks ? '' : undefined} />
          </button>
          <button className="dp-toggle" type="button" onClick={() => setFilters({ ...filters, hideDone: !filters.hideDone })}>
            <Ic.eyeOff size={15} /> Hide done & cancelled
            <span className="dp-switch" data-on={filters.hideDone ? '' : undefined} />
          </button>

          <div className="dp-divider" />
          <div className="dp-label">Show fields</div>
          {FIELD_ROWS.map((f) => (
            <button key={f.key} className="dp-field" type="button" onClick={() => setField(f.key)}>
              {f.label}
              <span className="dp-field-ex">{fieldExample(f.key)}</span>
              <span className="dp-switch" data-on={filters.fields[f.key] ? '' : undefined} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function GroupOrder({
  statusOrder,
  setStatusOrder,
  statusHidden,
  setStatusHidden,
  onBack,
}: DisplayProps & { onBack: () => void }) {
  const order: TaskStatus[] = statusOrder.length ? statusOrder : [...DEFAULT_STATUS_ORDER];
  const [dragId, setDragId] = useState<TaskStatus | null>(null);
  const [overId, setOverId] = useState<TaskStatus | null>(null);

  const drop = (target: TaskStatus) => {
    if (!dragId || dragId === target) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = order.slice();
    next.splice(next.indexOf(dragId), 1);
    next.splice(next.indexOf(target), 0, dragId);
    setStatusOrder(next);
    setDragId(null);
    setOverId(null);
  };

  const toggleHidden = (s: TaskStatus) =>
    setStatusHidden(statusHidden.includes(s) ? statusHidden.filter((x) => x !== s) : [...statusHidden, s]);

  return (
    <div className="display-pop">
      <button className="dp-back" onClick={onBack} type="button">
        <Ic.arrowLeft size={14} /> Group ordering
      </button>
      {order.map((s) => (
        <div
          key={s}
          className="dp-order-row"
          data-hidden={statusHidden.includes(s) ? '' : undefined}
          data-dragging={dragId === s ? '' : undefined}
          data-dragover={overId === s ? '' : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(s);
          }}
          onDrop={() => drop(s)}
        >
          <span className="dp-order-grip" draggable onDragStart={() => setDragId(s)} onDragEnd={() => setDragId(null)}>
            <Ic.grip size={13} />
          </span>
          <span className="dp-order-name">
            <span className="dot" style={{ background: `var(--st-${s})` }} />
            {TASK_STATUS_LABEL[s]}
          </span>
          <button className="dp-order-eye" type="button" onClick={() => toggleHidden(s)} aria-label={statusHidden.includes(s) ? 'Show group' : 'Hide group'}>
            {statusHidden.includes(s) ? <Ic.eyeOff size={14} /> : <Ic.eye size={14} />}
          </button>
        </div>
      ))}
    </div>
  );
}

const ORDERING_LABEL: Record<TaskOrdering, string> = {
  priority: 'Priority',
  updated: 'Recently updated',
  created: 'Recently created',
  due: 'Due date',
  title: 'Title',
};

export function BoardDisplayPopover({
  setMode,
  availDims,
  cfg,
  setCfg,
}: {
  setMode: (m: ViewMode) => void;
  availDims: GroupDim[];
  cfg: BoardCfg;
  setCfg: (patch: Partial<BoardCfg>) => void;
}) {
  const dirty = cfg.columns !== 'status' || cfg.rows !== 'none' || cfg.ordering !== 'priority' || cfg.hideDone || !cfg.showEmpty;
  const colDims = availDims; // columns can't be 'none'
  const setField = (key: FieldKey) => setCfg({ fields: { ...cfg.fields, [key]: !cfg.fields[key] } });

  return (
    <Popover
      align="right"
      width={300}
      trigger={
        <button className="icon-tool" data-on={dirty ? '' : undefined} type="button" aria-label="Board display options">
          <Ic.sliders size={16} />
          {dirty && <span className="tool-dot" />}
        </button>
      }
    >
      <div className="display-pop">
        <div className="dp-row">
          <span className="dp-row-lbl">View</span>
          <div className="seg-wrap">
            <button className="seg-btn" onClick={() => setMode('list')} type="button">
              <Ic.list size={14} /> List
            </button>
            <button className="seg-btn" data-active="" type="button">
              <Ic.board size={14} /> Board
            </button>
          </div>
        </div>
        <div className="dp-divider" />
        <div className="dp-row">
          <span className="dp-row-lbl">Columns</span>
          <select className="dp-dd" value={cfg.columns} onChange={(e) => setCfg({ columns: e.target.value as GroupDim })}>
            {colDims.map((d) => (
              <option key={d} value={d}>
                {DIM_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="dp-row">
          <span className="dp-row-lbl">Rows (swimlanes)</span>
          <select className="dp-dd" value={cfg.rows} onChange={(e) => setCfg({ rows: e.target.value as GroupDim })}>
            {['none' as GroupDim, ...availDims.filter((d) => d !== cfg.columns)].map((d) => (
              <option key={d} value={d}>
                {DIM_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="dp-row">
          <span className="dp-row-lbl">Ordering</span>
          <select className="dp-dd" value={cfg.ordering} onChange={(e) => setCfg({ ordering: e.target.value as BoardOrdering })}>
            {(Object.keys(ORDERING_LABEL) as BoardOrdering[]).map((o) => (
              <option key={o} value={o}>
                {ORDERING_LABEL[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="dp-divider" />
        <button className="dp-toggle" type="button" onClick={() => setCfg({ hideDone: !cfg.hideDone })}>
          <Ic.eyeOff size={15} /> Hide done & cancelled
          <span className="dp-switch" data-on={cfg.hideDone ? '' : undefined} />
        </button>
        <button className="dp-toggle" type="button" onClick={() => setCfg({ showEmpty: !cfg.showEmpty })}>
          <Ic.board size={15} /> Show empty columns
          <span className="dp-switch" data-on={cfg.showEmpty ? '' : undefined} />
        </button>
        <div className="dp-divider" />
        <div className="dp-label">Show fields</div>
        {FIELD_ROWS.map((f) => (
          <button key={f.key} className="dp-field" type="button" onClick={() => setField(f.key)}>
            {f.label}
            <span className="dp-field-ex">{fieldExample(f.key)}</span>
            <span className="dp-switch" data-on={cfg.fields[f.key] ? '' : undefined} />
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function FilterPopover({
  filters,
  setFilters,
  modules,
  milestones,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  modules: GroupModule[];
  milestones: GroupMilestone[];
}) {
  // `?? []` guards stale localStorage written before these fields existed.
  const moduleSel = filters.moduleId ?? [];
  const milestoneSel = filters.milestoneId ?? [];
  const activeCount = filters.status.length + filters.priority.length + moduleSel.length + milestoneSel.length;
  // Module/milestone names run long, so they live in collapsible dropdowns
  // (full-width rows) rather than wrapping chips. One open at a time.
  const [openSec, setOpenSec] = useState<'module' | 'milestone' | null>(null);
  const toggleStatus = (s: TaskStatus) =>
    setFilters({
      ...filters,
      status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s],
    });
  const togglePriority = (p: TaskPriority) =>
    setFilters({
      ...filters,
      priority: filters.priority.includes(p) ? filters.priority.filter((x) => x !== p) : [...filters.priority, p],
    });
  const toggleModule = (id: string) =>
    setFilters({
      ...filters,
      moduleId: moduleSel.includes(id) ? moduleSel.filter((x) => x !== id) : [...moduleSel, id],
    });
  const toggleMilestone = (id: string) =>
    setFilters({
      ...filters,
      milestoneId: milestoneSel.includes(id) ? milestoneSel.filter((x) => x !== id) : [...milestoneSel, id],
    });

  return (
    <Popover
      align="right"
      width={260}
      trigger={
        <button className="icon-tool" data-on={activeCount > 0 ? '' : undefined} type="button" aria-label="Filter">
          <Ic.filterFunnel size={16} />
          {activeCount > 0 && <span className="tool-dot" />}
        </button>
      }
    >
      <div className="display-pop">
        <div className="dp-block">
          <div className="dp-label">Status</div>
          <div className="chip-pick">
            {TASK_STATUS.filter((s) => s !== 'inbox').map((s) => (
              <button key={s} className="fchip" data-on={filters.status.includes(s) ? '' : undefined} onClick={() => toggleStatus(s)} type="button">
                <span className="dot" style={{ background: `var(--st-${s})` }} />
                {TASK_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="dp-block">
          <div className="dp-label">Priority</div>
          <div className="chip-pick">
            {TASK_PRIORITY.map((p) => (
              <button key={p} className="fchip" data-on={filters.priority.includes(p) ? '' : undefined} onClick={() => togglePriority(p)} type="button">
                <PriorityBars priority={p} />
                {TASK_PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {modules.length > 0 && (
          <div className="dp-block">
            <button className="dp-acc" data-open={openSec === 'module' ? '' : undefined} type="button" onClick={() => setOpenSec((s) => (s === 'module' ? null : 'module'))}>
              <span className="dp-acc-lbl">Module</span>
              {moduleSel.length > 0 && <span className="dp-acc-count">{moduleSel.length}</span>}
              <Ic.chevronRight size={14} className="dp-acc-chev" />
            </button>
            {openSec === 'module' && (
              <div className="dp-acc-list">
                {modules.map((m) => (
                  <button key={m.id} className="opt" data-active={moduleSel.includes(m.id) ? '' : undefined} onClick={() => toggleModule(m.id)} type="button">
                    <ModuleIcon icon={m.icon} color={m.color} size={14} />
                    <span className="dp-acc-name">{m.name}</span>
                    {moduleSel.includes(m.id) && <Ic.check size={15} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }} />}
                  </button>
                ))}
                <button className="opt" data-active={moduleSel.includes('') ? '' : undefined} onClick={() => toggleModule('')} type="button">
                  <span className="dot" style={{ background: 'var(--text-faint)' }} />
                  <span className="dp-acc-name">No module</span>
                  {moduleSel.includes('') && <Ic.check size={15} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }} />}
                </button>
              </div>
            )}
          </div>
        )}
        {milestones.length > 0 && (
          <div className="dp-block">
            <button className="dp-acc" data-open={openSec === 'milestone' ? '' : undefined} type="button" onClick={() => setOpenSec((s) => (s === 'milestone' ? null : 'milestone'))}>
              <span className="dp-acc-lbl">Milestone</span>
              {milestoneSel.length > 0 && <span className="dp-acc-count">{milestoneSel.length}</span>}
              <Ic.chevronRight size={14} className="dp-acc-chev" />
            </button>
            {openSec === 'milestone' && (
              <div className="dp-acc-list">
                {milestones.map((m) => (
                  <button key={m.id} className="opt" data-active={milestoneSel.includes(m.id) ? '' : undefined} onClick={() => toggleMilestone(m.id)} type="button">
                    <Ic.target size={14} />
                    <span className="dp-acc-name">{m.name}</span>
                    {milestoneSel.includes(m.id) && <Ic.check size={15} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }} />}
                  </button>
                ))}
                <button className="opt" data-active={milestoneSel.includes('') ? '' : undefined} onClick={() => toggleMilestone('')} type="button">
                  <span className="dot" style={{ background: 'var(--text-faint)' }} />
                  <span className="dp-acc-name">No milestone</span>
                  {milestoneSel.includes('') && <Ic.check size={15} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }} />}
                </button>
              </div>
            )}
          </div>
        )}
        {activeCount > 0 && (
          <button className="dp-reset" type="button" onClick={() => setFilters({ ...filters, status: [], priority: [], moduleId: [], milestoneId: [] })}>
            Clear filters
          </button>
        )}
      </div>
    </Popover>
  );
}
