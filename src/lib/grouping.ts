/**
 * Grouping engine for the task list (ported from the design prototype).
 * Given a primary (and optional secondary) axis, expand tasks into ordered
 * buckets. Each bucket knows how to MATCH a task and what PATCH to apply to a
 * task created inside it.
 */
import type { TaskDto } from '@/server/services';
import {
  TASK_PRIORITY,
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_RANK,
  DEFAULT_STATUS_ORDER,
  BOARD_COLUMNS,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';

export type GroupDim = 'module' | 'milestone' | 'status' | 'priority' | 'none';
/** Visual treatment for group/section headers in the list. */
export type GroupStyle = 'band' | 'rule';
export type IconName = 'cube' | 'target' | 'flag';

export interface GroupModule {
  id: string;
  name: string;
  color: string | null;
  icon?: string | null;
  state?: string | null;
  description?: string | null;
}
export interface GroupMilestone {
  id: string;
  name: string;
  status: string;
  targetDate: Date | string | null;
}

/** Per-row field visibility (Show fields). */
export interface FieldVis {
  taskId: boolean;
  priority: boolean;
  module: boolean;
  milestone: boolean;
  status: boolean;
}

export const DEFAULT_FIELDS: FieldVis = {
  taskId: true,
  priority: true,
  module: true,
  milestone: true,
  status: false,
};

export interface Filters {
  status: TaskStatus[];
  priority: TaskPriority[];
  /** Module ids to keep; `''` matches tasks with no module. Empty = no filter. */
  moduleId: string[];
  /** Milestone ids to keep; `''` matches tasks with no milestone. Empty = no filter. */
  milestoneId: string[];
  hideDone: boolean;
  showSubtasks: boolean;
  fields: FieldVis;
}

export const DEFAULT_FILTERS: Filters = {
  status: [],
  priority: [],
  moduleId: [],
  milestoneId: [],
  hideDone: false,
  showSubtasks: false,
  fields: DEFAULT_FIELDS,
};

export type NewTaskPatch = Partial<{
  moduleId: string | null;
  milestoneId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
}>;

export interface Section {
  id: string;
  name: string;
  color?: string;
  icon?: IconName;
  modIcon?: string | null; // module's tinted icon key (module groups only)
  target?: Date | string | null;
  defaultOpen: boolean;
  keep: boolean;
  patch: NewTaskPatch;
  tasks: TaskDto[];
  subs?: Section[];
}

interface Bucket {
  key: string;
  name: string;
  color?: string;
  icon?: IconName;
  modIcon?: string | null;
  target?: Date | string | null;
  defaultOpen: boolean;
  keep: boolean;
  patch: NewTaskPatch;
  match: (t: TaskDto) => boolean;
}

export function computeAvailDims(modules: GroupModule[], milestones: GroupMilestone[]): GroupDim[] {
  const dims: GroupDim[] = [];
  if (modules.length) dims.push('module');
  if (milestones.length) dims.push('milestone');
  dims.push('status', 'priority');
  return dims;
}

export interface GroupOpts {
  statusOrder?: TaskStatus[];
  statusHidden?: TaskStatus[];
  allowedStatus?: (s: TaskStatus) => boolean;
  /** Within-group task ordering; defaults to `priority` (the smart sort). */
  sort?: TaskOrdering;
}

function groupSpec(
  dim: GroupDim,
  modules: GroupModule[],
  milestones: GroupMilestone[],
  opts: GroupOpts = {},
): Bucket[] | null {
  if (dim === 'module') {
    const g: Bucket[] = modules.map((m) => ({
      key: m.id,
      name: m.name,
      color: m.color ?? undefined,
      modIcon: m.icon ?? null,
      defaultOpen: true,
      keep: false,
      patch: { moduleId: m.id },
      match: (t) => t.moduleId === m.id,
    }));
    g.push({
      key: '__nomod',
      name: 'No module',
      icon: 'cube',
      keep: true,
      defaultOpen: true,
      patch: { moduleId: null },
      match: (t) => !t.moduleId,
    });
    return g;
  }
  if (dim === 'milestone') {
    const g: Bucket[] = milestones.map((m) => ({
      key: m.id,
      name: m.name,
      icon: 'target',
      target: m.targetDate,
      defaultOpen: m.status !== 'done',
      keep: false,
      patch: { milestoneId: m.id },
      match: (t) => t.milestoneId === m.id,
    }));
    g.push({
      key: '__nomile',
      name: 'No milestone',
      icon: 'target',
      keep: true,
      defaultOpen: true,
      patch: { milestoneId: null },
      match: (t) => !t.milestoneId,
    });
    return g;
  }
  if (dim === 'status') {
    // Status groups render in statusOrder (falls back to DEFAULT_STATUS_ORDER),
    // honoring per-view hidden groups + the view's allowed-status scope.
    const order = (opts.statusOrder?.length ? opts.statusOrder : DEFAULT_STATUS_ORDER) as readonly TaskStatus[];
    const hidden = new Set(opts.statusHidden ?? []);
    return order
      .filter((s) => !hidden.has(s))
      .filter((s) => (opts.allowedStatus ? opts.allowedStatus(s) : true))
      .map((s) => ({
        key: s,
        name: TASK_STATUS_LABEL[s],
        color: `var(--st-${s})`,
        defaultOpen: s !== 'done' && s !== 'cancelled',
        keep: false,
        patch: { status: s },
        match: (t) => t.status === s,
      }));
  }
  if (dim === 'priority') {
    return [...TASK_PRIORITY].reverse().map((p) => ({
      key: p,
      name: TASK_PRIORITY_LABEL[p],
      icon: 'flag',
      defaultOpen: true,
      keep: false,
      patch: { priority: p },
      match: (t) => t.priority === p,
    }));
  }
  return null;
}

/**
 * Within-group task ordering, shared by list sections and board columns.
 * `priority` is the default smart sort (done sinks, then higher priority, then
 * oldest); `updated`/`created` are the "recents" sorts (most-recent first).
 */
export type TaskOrdering = 'priority' | 'updated' | 'created' | 'due' | 'title';

export const DEFAULT_TASK_ORDERING: TaskOrdering = 'priority';

export function taskComparator(ordering: TaskOrdering): (a: TaskDto, b: TaskDto) => number {
  switch (ordering) {
    case 'updated':
      return (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    case 'created':
      return (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    case 'due':
      return (a, b) => {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return av - bv || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      };
    case 'title':
      return (a, b) => a.title.localeCompare(b.title);
    case 'priority':
    default:
      return (a, b) =>
        Number(a.done) - Number(b.done) ||
        TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority] ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
}

export function buildSections(
  tasks: TaskDto[],
  primary: GroupDim,
  secondary: GroupDim,
  filters: Filters,
  modules: GroupModule[],
  milestones: GroupMilestone[],
  opts: GroupOpts = {},
): Section[] {
  // Guard against stale localStorage written before these fields existed.
  const moduleSel = filters.moduleId ?? [];
  const milestoneSel = filters.milestoneId ?? [];
  const pass = (t: TaskDto) => {
    if (opts.allowedStatus && !opts.allowedStatus(t.status)) return false;
    if (filters.status.length && !filters.status.includes(t.status)) return false;
    if (filters.priority.length && !filters.priority.includes(t.priority)) return false;
    if (moduleSel.length && !moduleSel.includes(t.moduleId ?? '')) return false;
    if (milestoneSel.length && !milestoneSel.includes(t.milestoneId ?? '')) return false;
    if (filters.hideDone && (t.done || t.status === 'cancelled')) return false;
    return true;
  };
  const ptasks = tasks.filter(pass);
  const cmp = taskComparator(opts.sort ?? DEFAULT_TASK_ORDERING);

  const primGroups = groupSpec(primary, modules, milestones, opts);
  if (!primGroups) {
    return [{ id: '__all', name: '', defaultOpen: true, keep: true, patch: {}, tasks: ptasks.slice().sort(cmp) }];
  }

  const subDim = secondary !== 'none' && secondary !== primary ? secondary : null;

  return primGroups.map((g) => {
    const groupTasks = ptasks.filter(g.match).sort(cmp);
    const sec: Section = {
      id: g.key,
      name: g.name,
      color: g.color,
      icon: g.icon,
      modIcon: g.modIcon,
      target: g.target,
      defaultOpen: g.defaultOpen,
      keep: g.keep,
      patch: g.patch,
      tasks: groupTasks,
    };
    if (subDim) {
      const subGroups = groupSpec(subDim, modules, milestones, opts) ?? [];
      sec.subs = subGroups
        .map((sg) => ({
          id: `${g.key}::${sg.key}`,
          name: sg.name,
          color: sg.color,
          icon: sg.icon,
          modIcon: sg.modIcon,
          target: sg.target,
          defaultOpen: true,
          keep: false,
          patch: { ...g.patch, ...sg.patch },
          tasks: groupTasks.filter(sg.match),
        }))
        .filter((s) => s.tasks.length > 0);
    }
    return sec;
  });
}

// ============================ Board (configurable) ============================

export type BoardOrdering = TaskOrdering;

export interface BoardCfg {
  columns: GroupDim; // dimension for columns
  rows: GroupDim; // dimension for swimlanes ('none' = no lanes)
  ordering: BoardOrdering;
  hideDone: boolean;
  showEmpty: boolean; // show empty columns/rows
  fields: FieldVis;
}

export const DEFAULT_BOARD_CFG: BoardCfg = {
  columns: 'status',
  rows: 'none',
  ordering: 'priority',
  hideDone: false,
  showEmpty: true,
  fields: DEFAULT_FIELDS,
};

export interface BoardBucket {
  key: string;
  name: string;
  color?: string;
  modIcon?: string | null;
  icon?: IconName;
  patch: NewTaskPatch;
  match: (t: TaskDto) => boolean;
}

/** Expand a dimension into ordered board columns (or swimlane rows). */
export function boardBuckets(dim: GroupDim, modules: GroupModule[], milestones: GroupMilestone[]): BoardBucket[] {
  if (dim === 'status') {
    return BOARD_COLUMNS.map((s) => ({
      key: s,
      name: TASK_STATUS_LABEL[s],
      color: `var(--st-${s})`,
      patch: { status: s },
      match: (t) => t.status === s,
    }));
  }
  const spec = groupSpec(dim, modules, milestones);
  return spec ?? [];
}

export function sortBoardCards(ordering: BoardOrdering): (a: TaskDto, b: TaskDto) => number {
  return taskComparator(ordering);
}
