/**
 * Domain constants, enums, and ref helpers — the single source of truth.
 *
 * Framework-agnostic and client-safe (no server/db imports), so the Drizzle
 * schema, the zod validators, and React components all import the same values.
 * Ported from `docs/brainstorm/shared.ts` and extended per `docs/scope.md`.
 */

// ---- Enum value tuples (as const so they drive Drizzle, zod, and the UI) ----

export const TASK_STATUS = [
  'inbox', // not yet triaged (Inbox tasks only, project_id null)
  'backlog', // not planned yet
  'todo', // will do
  'in_progress', // doing now
  'in_review', // up for review (violet)
  'pending', // waiting on something (amber; pairs with status_note)
  'done', // finished
  'cancelled', // dropped
] as const;

export const TASK_PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export const MILESTONE_STATUS = ['planned', 'active', 'done'] as const;

/** Module lifecycle (sub-system status). Each maps to a status color key below. */
export const MODULE_STATE = ['planned', 'active', 'done', 'archived'] as const;

/** Lifecycle of a whole project (drives the sidebar grouping). */
export const PROJECT_STATUS = [
  'active',
  'planned',
  'paused',
  'done',
  'backlog',
  'cancelled',
] as const;

export const COMMENT_SOURCE = [
  'web', // from the web UI
  'api', // from the REST API (Telegram, vscode…)
  'mcp', // from an MCP tool
  'agent', // an AI agent logging its own progress
] as const;

export const API_KEY_SCOPE = ['read', 'write', 'read-write'] as const;

/** User role — display label only; not enforced as RBAC in the indie app. */
export const USER_ROLE = ['admin', 'agent'] as const;

/** Attachment kind — drives thumbnail vs file-tile rendering (v3). */
export const ATTACHMENT_TYPE = ['file', 'image'] as const;

/** Board (kanban) default columns — a subset of task status (v3). */
export const BOARD_COLUMNS = [
  'todo',
  'in_progress',
  'pending',
  'in_review',
  'done',
] as const;

/**
 * Order status *groups* render in when the list is grouped by status —
 * active work first. Excludes `inbox` (Inbox is its own route, not a group).
 */
export const DEFAULT_STATUS_ORDER = [
  'in_progress',
  'in_review',
  'pending',
  'todo',
  'backlog',
  'done',
  'cancelled',
] as const;

/** Curated icon pick-list for modules (keys into the icon set). */
export const MODULE_ICONS = [
  'cube',
  'layers',
  'bolt',
  'sparkle',
  'globe',
  'folder',
  'board',
  'table',
  'settings',
  'search',
  'target',
  'key',
  'tag',
  'inbox',
  'lock',
  'sliders',
] as const;

// ---- Derived TS union types ----

export type TaskStatus = (typeof TASK_STATUS)[number];
export type TaskPriority = (typeof TASK_PRIORITY)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];
export type ModuleState = (typeof MODULE_STATE)[number];
export type ModuleIcon = (typeof MODULE_ICONS)[number];
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type CommentSource = (typeof COMMENT_SOURCE)[number];
export type ApiKeyScope = (typeof API_KEY_SCOPE)[number];
export type UserRole = (typeof USER_ROLE)[number];
export type AttachmentType = (typeof ATTACHMENT_TYPE)[number];

// ---- Defaults ----

export const DEFAULT_TASK_STATUS: TaskStatus = 'backlog';
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'none';
export const DEFAULT_MILESTONE_STATUS: MilestoneStatus = 'planned';
export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'active';
export const DEFAULT_MODULE_STATE: ModuleState = 'active';

// ---- Display metadata (labels for the UI; colors live in tokens.css) ----

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  pending: 'Pending',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  done: 'Done',
};

export const MODULE_STATE_LABEL: Record<ModuleState, string> = {
  planned: 'Planned',
  active: 'Active',
  done: 'Done',
  archived: 'Archived',
};

/** Module state → status color key, so chips reuse the status palette (--st-*). */
export const MODULE_STATE_COLOR_KEY: Record<ModuleState, TaskStatus> = {
  planned: 'backlog',
  active: 'in_progress',
  done: 'done',
  archived: 'cancelled',
};

/** Project lifecycle status → display label + the sidebar group it sorts into. */
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'In progress',
  planned: 'Planned',
  paused: 'Paused',
  done: 'Completed',
  backlog: 'Backlog',
  cancelled: 'Cancelled',
};

// ---- Project key + ref helpers (public identity "DISK-3") ----

/** Project key: uppercase first char, A-Z0-9 only, 2-10 chars, no '-'. */
export const PROJECT_KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;

export function isValidProjectKey(key: string): boolean {
  return PROJECT_KEY_REGEX.test(key);
}

/** Build the display ref from a project key + seq → "DISK-3". */
export function buildRef(projectKey: string, seq: number): string {
  return `${projectKey}-${seq}`;
}

/**
 * Parse "DISK-3" → { key: "DISK", seq: 3 }. Split on the LAST '-' defensively.
 * Returns null on malformed input.
 */
export function parseRef(ref: string): { key: string; seq: number } | null {
  const idx = ref.lastIndexOf('-');
  if (idx <= 0 || idx === ref.length - 1) return null;
  const key = ref.slice(0, idx);
  const seqStr = ref.slice(idx + 1);
  if (!isValidProjectKey(key)) return null;
  if (!/^\d+$/.test(seqStr)) return null;
  const seq = Number(seqStr);
  if (!Number.isInteger(seq) || seq <= 0) return null;
  return { key, seq };
}
