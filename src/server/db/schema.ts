/**
 * PostgreSQL schema (Drizzle) — the full IndieWork data model (docs/scope.md §2).
 *
 * Conventions:
 *  - PK: uuid, server-generated (gen_random_uuid). Internal only — public
 *    identity is the ref "KEY-seq" built from project.key + task.seq.
 *  - enums: text + Drizzle `{ enum }` (type-safe at the TS layer; no native
 *    pg enums, which add migration friction for no benefit here).
 *  - timestamps: timestamptz, default now().
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  MILESTONE_STATUS,
  MODULE_STATE,
  PROJECT_STATUS,
  COMMENT_SOURCE,
  API_KEY_SCOPE,
  ATTACHMENT_TYPE,
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_MILESTONE_STATUS,
  DEFAULT_MODULE_STATE,
  DEFAULT_PROJECT_STATUS,
} from '@/lib/domain';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---- workspaces (top-level container above projects) ----
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  emoji: text('emoji'),
  tagline: text('tagline'),
  ...timestamps,
});

// ---- projects ----
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    key: text('key').notNull(), // "DISK" — uppercase, validated in the service
    name: text('name').notNull(),
    emoji: text('emoji'),
    color: text('color'),
    status: text('status', { enum: PROJECT_STATUS })
      .notNull()
      .default(DEFAULT_PROJECT_STATUS),
    pinned: boolean('pinned').notNull().default(false),
    tags: text('tags').array().notNull().default([]),
    shortDesc: text('short_desc'),
    statusNote: text('status_note'), // "where the project is at" (overwrite)
    description: text('description'), // markdown
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('projects_key_unique').on(t.key),
    index('projects_workspace_idx').on(t.workspaceId),
  ],
);

// ---- project_counters (per-project seq allocation, atomic) ----
export const projectCounters = pgTable('project_counters', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  nextSeq: integer('next_seq').notNull().default(1),
});

// ---- milestones (= PHASE) ----
export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: MILESTONE_STATUS })
      .notNull()
      .default(DEFAULT_MILESTONE_STATUS),
    targetDate: timestamp('target_date', { withTimezone: true }),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('milestones_project_idx').on(t.projectId)],
);

// ---- modules (= SUB-SYSTEM) ----
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    icon: text('icon'), // key into the icon set (MODULE_ICONS)
    state: text('state', { enum: MODULE_STATE }).notNull().default(DEFAULT_MODULE_STATE),
    description: text('description'), // one-line "what does this module cover?"
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('modules_project_idx').on(t.projectId)],
);

// ---- tasks ----
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // project_id NULL = Inbox (not yet triaged)
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    // parent_id NULL = top-level task; otherwise a one-level sub-task (deleting
    // a parent cascades to its children).
    parentId: uuid('parent_id').references((): AnyPgColumn => tasks.id, {
      onDelete: 'cascade',
    }),
    moduleId: uuid('module_id').references(() => modules.id, {
      onDelete: 'set null',
    }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, {
      onDelete: 'set null',
    }),
    seq: integer('seq'), // null in Inbox; allocated when assigned to a project
    title: text('title').notNull(),
    description: text('description'), // markdown
    status: text('status', { enum: TASK_STATUS })
      .notNull()
      .default(DEFAULT_TASK_STATUS),
    priority: text('priority', { enum: TASK_PRIORITY })
      .notNull()
      .default(DEFAULT_TASK_PRIORITY),
    statusNote: text('status_note'), // "what's blocking me" (overwrite)
    position: integer('position').notNull().default(0),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }), // set on → done
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tasks_project_seq_unique').on(t.projectId, t.seq),
    index('tasks_project_status_idx').on(t.projectId, t.status),
    index('tasks_module_idx').on(t.moduleId),
    index('tasks_milestone_idx').on(t.milestoneId),
    index('tasks_parent_idx').on(t.parentId),
  ],
);

// ---- attachments (files + images on a task; storage path is wired later) ----
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ATTACHMENT_TYPE }).notNull().default('file'),
    size: text('size'), // human-readable, e.g. "4.2 KB"
    ext: text('ext'), // file extension, drives the per-type hue
    path: text('path'), // storage path — NULL until upload wiring lands (deferred)
    url: text('url'), // object URL for live-added images; absent for stored files
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_task_idx').on(t.taskId)],
);

// ---- comments (= timeline / journal, append-only) ----
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    body: text('body').notNull(), // markdown
    source: text('source', { enum: COMMENT_SOURCE }).notNull().default('web'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_task_idx').on(t.taskId)],
);

// ---- api_keys (managed, scoped tokens — built in Phase 4, table reserved) ----
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull().default('iw_live_'),
  hash: text('hash').notNull(), // sha-256 of the secret; shown once on create
  tail: text('tail').notNull(), // last 4 chars, for display
  scope: text('scope', { enum: API_KEY_SCOPE }).notNull().default('read-write'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- labels + task_labels (free cross-cut — Phase 4, tables reserved) ----
export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
  },
  (t) => [index('labels_project_idx').on(t.projectId)],
);

export const taskLabels = pgTable(
  'task_labels',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('task_labels_pk').on(t.taskId, t.labelId),
    index('task_labels_label_idx').on(t.labelId),
  ],
);
