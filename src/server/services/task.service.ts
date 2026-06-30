import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema, allocateSeq } from '@/server/db';
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
  setStatusNoteSchema,
} from '@/server/validators/task';
import { parseRef, TASK_STATUS, TASK_PRIORITY_RANK, type TaskStatus } from '@/lib/domain';
import { toTaskDto, type TaskDto } from './dto';
import { badRequest, notFound } from './errors';
import { definedKeys, positionByOrder } from './util';

/** Task row joined with its project key (for building the ref). */
function selectWithKey() {
  return db
    .select({ task: schema.tasks, projectKey: schema.projects.key })
    .from(schema.tasks)
    .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id));
}

async function readDto(id: string): Promise<TaskDto> {
  const [r] = await selectWithKey().where(eq(schema.tasks.id, id)).limit(1);
  if (!r) throw notFound('task');
  return toTaskDto(r.task, r.projectKey);
}

/** When status moves to `done`, stamp completed_at; otherwise clear it. */
function completedAtFor(status: TaskStatus | undefined): { completedAt?: Date | null } {
  if (status === undefined) return {};
  return { completedAt: status === 'done' ? new Date() : null };
}

/** done last → higher priority first → older first (matches the design). */
function sortTasks(a: TaskDto, b: TaskDto) {
  return (
    Number(a.done) - Number(b.done) ||
    TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority] ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

export const taskService = {
  async create(input: unknown, createdById?: string | null): Promise<TaskDto> {
    const data = createTaskSchema.parse(input);
    // A task with a parent is a sub-task — route through addSubtask (inherits
    // the parent's project/module/milestone and allocates its own seq).
    if (data.parentId) return this.addSubtask(data.parentId, data.title, data.status, createdById);

    const status: TaskStatus = data.status ?? (data.projectId ? 'todo' : 'inbox');

    const values = {
      title: data.title,
      moduleId: data.moduleId ?? null,
      milestoneId: data.milestoneId ?? null,
      description: data.description ?? null,
      statusNote: data.statusNote ?? null,
      dueDate: data.dueDate ?? null,
      priority: data.priority,
      status,
      createdById: createdById ?? null,
      ...completedAtFor(status),
    };

    // Inbox task: no project, no seq.
    if (!data.projectId) {
      const [row] = await db
        .insert(schema.tasks)
        .values({ ...values, projectId: null, seq: null })
        .returning({ id: schema.tasks.id });
      return readDto(row.id);
    }

    // Assigned task: allocate a per-project seq atomically.
    const projectId = data.projectId;
    const id = await db.transaction(async (tx) => {
      const seq = await allocateSeq(tx, projectId);
      const [row] = await tx
        .insert(schema.tasks)
        .values({ ...values, projectId, seq })
        .returning({ id: schema.tasks.id });
      return row.id;
    });
    return readDto(id);
  },

  async update(id: string, input: unknown): Promise<TaskDto> {
    const data = updateTaskSchema.parse(input);
    const patch = definedKeys(data);
    const [row] = await db
      .update(schema.tasks)
      .set({ ...patch, ...completedAtFor(data.status), updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });
    if (!row) throw notFound('task');
    return readDto(row.id);
  },

  /** Toggle the done circle: done ⇄ todo, keeping completed_at in sync. */
  async toggleDone(id: string): Promise<TaskDto> {
    const [cur] = await db
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .limit(1);
    if (!cur) throw notFound('task');
    const next: TaskStatus = cur.status === 'done' ? 'todo' : 'done';
    return this.update(id, { status: next });
  },

  /** Triage from the Inbox: attach to a project and allocate its seq. */
  async assignToProject(id: string, projectId: string): Promise<TaskDto> {
    const resultId = await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ id: schema.tasks.id, seq: schema.tasks.seq })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, id))
        .limit(1);
      if (!cur) throw notFound('task');
      const seq = cur.seq ?? (await allocateSeq(tx, projectId));
      await tx
        .update(schema.tasks)
        .set({ projectId, seq, status: 'backlog', updatedAt: new Date() })
        .where(eq(schema.tasks.id, id));
      return id;
    });
    return readDto(resultId);
  },

  async setStatusNote(id: string, input: unknown): Promise<TaskDto> {
    const { note } = setStatusNoteSchema.parse(input);
    const [row] = await db
      .update(schema.tasks)
      .set({ statusNote: note, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });
    if (!row) throw notFound('task');
    return readDto(row.id);
  },

  async reorder(ids: string[]): Promise<{ ok: true }> {
    // PP-B3: one bulk CASE update, not N sequential per-row updates.
    if (ids.length > 0) {
      await db
        .update(schema.tasks)
        .set({ position: positionByOrder(schema.tasks.id, ids), updatedAt: new Date() })
        .where(inArray(schema.tasks.id, ids));
    }
    return { ok: true };
  },

  async delete(id: string): Promise<{ ok: true }> {
    const [row] = await db
      .delete(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });
    if (!row) throw notFound('task');
    return { ok: true };
  },

  async getById(id: string): Promise<TaskDto> {
    return readDto(id);
  },

  /** Children of a task (one level), ordered by creation. */
  async listChildren(parentId: string): Promise<TaskDto[]> {
    const rows = await selectWithKey().where(eq(schema.tasks.parentId, parentId));
    return rows
      .map((r) => toTaskDto(r.task, r.projectKey))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  /**
   * Add a sub-task to a parent (one level deep). Inherits the parent's project,
   * module, and milestone. A sub-task is a first-class task: it allocates its own
   * per-project `seq`, so its public ref is the usual `KEY-<n>` (e.g. "DISK-15").
   * Defaults to status `todo`. Sub-tasks under an Inbox parent (no project) keep
   * `seq = null`, exactly like Inbox tasks, until the parent is assigned.
   */
  async addSubtask(
    parentId: string,
    title: string,
    status?: TaskStatus,
    createdById?: string | null,
  ): Promise<TaskDto> {
    const parent = await readDto(parentId);
    if (parent.parentId) throw badRequest('sub-tasks are one level deep');
    const s: TaskStatus = status ?? 'todo';
    // addSubtask is the one mutation not guarded by a Zod schema, and the DB enum
    // is only a type hint — validate the status explicitly so a bad value can't persist.
    if (!(TASK_STATUS as readonly string[]).includes(s)) {
      throw badRequest(`invalid status "${s}"`);
    }
    const values = {
      title,
      parentId,
      projectId: parent.projectId,
      moduleId: parent.moduleId,
      milestoneId: parent.milestoneId,
      status: s,
      createdById: createdById ?? null,
      ...completedAtFor(s),
    };

    // Inbox parent: no project, no seq (a ref is allocated once assigned).
    if (!parent.projectId) {
      const [row] = await db
        .insert(schema.tasks)
        .values({ ...values, seq: null })
        .returning({ id: schema.tasks.id });
      return readDto(row.id);
    }

    // Assigned parent: allocate a per-project seq atomically, like create().
    const projectId = parent.projectId;
    const id = await db.transaction(async (tx) => {
      const seq = await allocateSeq(tx, projectId);
      const [row] = await tx
        .insert(schema.tasks)
        .values({ ...values, seq })
        .returning({ id: schema.tasks.id });
      return row.id;
    });
    return readDto(id);
  },

  /**
   * Move a task under a different parent, or detach it to the top level.
   * `newParentId = null` makes the task a root task; otherwise it becomes a
   * one-level sub-task of `newParentId`. Only `parentId` is rewritten — module
   * and milestone are inherited once at creation and then owned independently,
   * so they're left untouched (and same-project keeps their FKs valid).
   *
   * To keep the hierarchy one level deep and the ref stable, the new parent
   * must be a top-level task in the SAME project as the task being moved, and
   * the task being moved may not have sub-tasks of its own. Cross-project moves
   * (which would churn the seq/ref) are out of scope.
   */
  async reparent(id: string, newParentId: string | null): Promise<TaskDto> {
    const task = await readDto(id); // 404 if the task is gone

    if (newParentId) {
      if (newParentId === id) throw badRequest('a task cannot be its own parent');
      const parent = await readDto(newParentId); // 404 if the new parent is gone
      if (parent.parentId)
        throw badRequest('the new parent must be a top-level task (sub-tasks are one level deep)');
      if ((task.projectId ?? null) !== (parent.projectId ?? null))
        throw badRequest('the new parent must be in the same project as the task');
      const kids = await this.listChildren(id);
      if (kids.length > 0) throw badRequest('cannot re-parent a task that has its own sub-tasks');
    }

    const [row] = await db
      .update(schema.tasks)
      .set({ parentId: newParentId, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });
    if (!row) throw notFound('task');
    return readDto(row.id);
  },

  /** Resolve "DISK-3" → the task DTO. */
  async getByRef(ref: string): Promise<TaskDto> {
    const parsed = parseRef(ref);
    if (!parsed) throw badRequest(`invalid ref "${ref}"`);
    const [r] = await selectWithKey()
      .where(and(eq(schema.projects.key, parsed.key), eq(schema.tasks.seq, parsed.seq)))
      .limit(1);
    if (!r) throw notFound(`task ${ref}`);
    return toTaskDto(r.task, r.projectKey);
  },

  async list(input: unknown): Promise<TaskDto[]> {
    const f = listTasksSchema.parse(input);
    const conds = [];
    if (f.inbox) conds.push(isNull(schema.tasks.projectId));
    if (f.projectId) conds.push(eq(schema.tasks.projectId, f.projectId));
    if (f.moduleId) conds.push(eq(schema.tasks.moduleId, f.moduleId));
    if (f.milestoneId) conds.push(eq(schema.tasks.milestoneId, f.milestoneId));
    if (f.status?.length) conds.push(inArray(schema.tasks.status, f.status));
    if (f.priority?.length) conds.push(inArray(schema.tasks.priority, f.priority));
    if (f.hideDone) conds.push(sql`${schema.tasks.status} not in ('done','cancelled')`);

    const rows = await db
      .select({
        task: schema.tasks,
        projectKey: schema.projects.key,
        attachmentCount: sql<number>`(select cast(count(*) as integer) from ${schema.attachments} where ${schema.attachments.taskId} = ${schema.tasks.id})`,
      })
      .from(schema.tasks)
      .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(conds.length ? and(...conds) : undefined);
    return rows.map((r) => toTaskDto(r.task, r.projectKey, Number(r.attachmentCount))).sort(sortTasks);
  },

  async listInbox(): Promise<TaskDto[]> {
    return this.list({ inbox: true });
  },
};
