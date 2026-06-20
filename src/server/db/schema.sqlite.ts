/**
 * SQLite schema (Drizzle) — a 1:1 structural mirror of the Postgres schema
 * (./schema.ts) for the self-contained `DB_DRIVER=sqlite` deploy (the public
 * demo + easy self-host). Driver selection lives in ./index.ts.
 *
 * The two dialect schemas MUST stay type-identical so the service layer can be
 * driver-agnostic: ./index.ts keeps ./schema.ts (Postgres) as the canonical
 * TYPE module and casts the runtime sqlite db to it at the seam. Keep the
 * columns/tables/indexes here in lockstep with ./schema.ts.
 *
 * Dialect mapping (vs ./schema.ts):
 *  - uuid PK / FK            → text + $defaultFn(newUuid) so IDs/refs stay
 *                              identical uuid v7 strings across both drivers
 *  - timestamptz             → integer { mode: 'timestamp' } (unixepoch())
 *  - boolean                 → integer { mode: 'boolean' }
 *  - text[] (tags)           → text { mode: 'json' } $type<string[]>
 *  - text enums / indexes    → unchanged
 *
 * Foreign-key cascades (the seed's idempotent reset relies on them) need FK
 * enforcement ON; libsql defaults it on and ./index.ts also sets the pragma.
 */

import { newUuid } from '@/lib/uuid';
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  MILESTONE_STATUS,
  MODULE_STATE,
  PROJECT_STATUS,
  COMMENT_SOURCE,
  API_KEY_SCOPE,
  USER_ROLE,
  ATTACHMENT_TYPE,
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_MILESTONE_STATUS,
  DEFAULT_MODULE_STATE,
  DEFAULT_PROJECT_STATUS,
} from '@/lib/domain';

/** uuid v7 string PK, generated app-side to match Postgres uuid columns. */
const uuidPk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newUuid());

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

// ---- users (identity for admin + agent attribution) ----
export const users = sqliteTable(
  'users',
  {
    id: uuidPk(),
    email: text('email'), // required for admin; NULL for agents (passwordless, identified by name + api_key)
    name: text('name').notNull(),
    role: text('role', { enum: USER_ROLE }).notNull(),
    passwordHash: text('password_hash'), // NULL for agents
    disabledAt: integer('disabled_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

// ---- workspaces (top-level container above projects) ----
export const workspaces = sqliteTable('workspaces', {
  id: uuidPk(),
  name: text('name').notNull(),
  emoji: text('emoji'),
  tagline: text('tagline'),
  ...timestamps,
});

// ---- projects ----
export const projects = sqliteTable(
  'projects',
  {
    id: uuidPk(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    key: text('key').notNull(), // "DISK" — uppercase, validated in the service
    name: text('name').notNull(),
    emoji: text('emoji'),
    color: text('color'),
    status: text('status', { enum: PROJECT_STATUS })
      .notNull()
      .default(DEFAULT_PROJECT_STATUS),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    shortDesc: text('short_desc'),
    statusNote: text('status_note'), // "where the project is at" (overwrite)
    description: text('description'), // markdown
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('projects_key_unique').on(t.key),
    index('projects_workspace_idx').on(t.workspaceId),
  ],
);

// ---- project_counters (per-project seq allocation, atomic) ----
export const projectCounters = sqliteTable('project_counters', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  nextSeq: integer('next_seq').notNull().default(1),
});

// ---- milestones (= PHASE) ----
export const milestones = sqliteTable(
  'milestones',
  {
    id: uuidPk(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: MILESTONE_STATUS })
      .notNull()
      .default(DEFAULT_MILESTONE_STATUS),
    targetDate: integer('target_date', { mode: 'timestamp' }),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('milestones_project_idx').on(t.projectId)],
);

// ---- modules (= SUB-SYSTEM) ----
export const modules = sqliteTable(
  'modules',
  {
    id: uuidPk(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    icon: text('icon'), // key into the icon set (MODULE_ICONS)
    state: text('state', { enum: MODULE_STATE }).notNull().default(DEFAULT_MODULE_STATE),
    description: text('description'), // one-line "what does this module cover?"
    position: integer('position').notNull().default(0),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [index('modules_project_idx').on(t.projectId)],
);

// ---- tasks ----
export const tasks = sqliteTable(
  'tasks',
  {
    id: uuidPk(),
    // project_id NULL = Inbox (not yet triaged)
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    // parent_id NULL = top-level task; otherwise a one-level sub-task (deleting
    // a parent cascades to its children).
    parentId: text('parent_id').references((): AnySQLiteColumn => tasks.id, {
      onDelete: 'cascade',
    }),
    moduleId: text('module_id').references(() => modules.id, {
      onDelete: 'set null',
    }),
    milestoneId: text('milestone_id').references(() => milestones.id, {
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
    dueDate: integer('due_date', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }), // set on → done
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
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
export const attachments = sqliteTable(
  'attachments',
  {
    id: uuidPk(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ATTACHMENT_TYPE }).notNull().default('file'),
    size: text('size'), // human-readable, e.g. "4.2 KB"
    ext: text('ext'), // file extension, drives the per-type hue
    path: text('path'), // storage path — NULL until upload wiring lands (deferred)
    url: text('url'), // object URL for live-added images; absent for stored files
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('attachments_task_idx').on(t.taskId)],
);

// ---- comments (= timeline / journal, append-only) ----
export const comments = sqliteTable(
  'comments',
  {
    id: uuidPk(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    body: text('body').notNull(), // markdown
    source: text('source', { enum: COMMENT_SOURCE }).notNull().default('web'),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    editedAt: integer('edited_at', { mode: 'timestamp' }), // null until first edit → drives the "edited" badge
  },
  (t) => [index('comments_task_idx').on(t.taskId)],
);

// ---- api_keys (managed, scoped tokens — built in Phase 4, table reserved) ----
export const apiKeys = sqliteTable('api_keys', {
  id: uuidPk(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull().default('iw_live_'),
  hash: text('hash').notNull(), // sha-256 of the secret; shown once on create
  tail: text('tail').notNull(), // last 4 chars, for display
  scope: text('scope', { enum: API_KEY_SCOPE }).notNull().default('read-write'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---- labels + task_labels (free cross-cut — Phase 4, tables reserved) ----
export const labels = sqliteTable(
  'labels',
  {
    id: uuidPk(),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps,
  },
  (t) => [index('labels_project_idx').on(t.projectId)],
);

export const taskLabels = sqliteTable(
  'task_labels',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('task_labels_pk').on(t.taskId, t.labelId),
    index('task_labels_label_idx').on(t.labelId),
  ],
);
