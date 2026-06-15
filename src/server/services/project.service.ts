import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import {
  createProjectSchema,
  updateProjectSchema,
  setProjectStatusNoteSchema,
} from '@/server/validators/project';
import { conflict, notFound } from './errors';
import { definedKeys } from './util';

/** A project plus a live open-issue count (tasks not done/cancelled). */
async function withCounts<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return [] as (T & { issues: number })[];
  const counts = await db
    .select({
      projectId: schema.tasks.projectId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.tasks)
    .where(
      and(
        sql`${schema.tasks.status} not in ('done','cancelled')`,
        sql`${schema.tasks.projectId} is not null`,
      ),
    )
    .groupBy(schema.tasks.projectId);
  const map = new Map(counts.map((c) => [c.projectId, c.n]));
  return rows.map((r) => ({ ...r, issues: map.get(r.id) ?? 0 }));
}

export const projectService = {
  /**
   * List projects, newest-relevant first. Pass `workspaceId` to scope to one
   * workspace; with `includeNullWorkspace` (used for the default workspace),
   * legacy projects with no workspace are folded in so they never disappear.
   */
  async list({
    includeArchived = false,
    workspaceId,
    includeNullWorkspace = false,
  }: {
    includeArchived?: boolean;
    workspaceId?: string | null;
    includeNullWorkspace?: boolean;
  } = {}) {
    const conds = [];
    if (!includeArchived) conds.push(isNull(schema.projects.archivedAt));
    if (workspaceId != null) {
      conds.push(
        includeNullWorkspace
          ? or(eq(schema.projects.workspaceId, workspaceId), isNull(schema.projects.workspaceId))
          : eq(schema.projects.workspaceId, workspaceId),
      );
    }
    const rows = await db
      .select()
      .from(schema.projects)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(schema.projects.createdAt);
    return withCounts(rows);
  },

  async getByKey(key: string) {
    const [row] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.key, key.toUpperCase()))
      .limit(1);
    if (!row) throw notFound(`project "${key}"`);
    return row;
  },

  async getById(id: string) {
    const [row] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .limit(1);
    if (!row) throw notFound('project');
    return row;
  },

  async create(input: unknown) {
    const data = createProjectSchema.parse(input);
    const existing = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.key, data.key))
      .limit(1);
    if (existing.length) throw conflict(`project key "${data.key}" is already in use`);

    const [row] = await db
      .insert(schema.projects)
      .values({ ...data, tags: data.tags ?? [] })
      .returning();
    return row;
  },

  async update(id: string, input: unknown) {
    const data = updateProjectSchema.parse(input);
    const patch = definedKeys(data);
    const [row] = await db
      .update(schema.projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .returning();
    if (!row) throw notFound('project');
    return row;
  },

  async setStatusNote(id: string, input: unknown) {
    const { note } = setProjectStatusNoteSchema.parse(input);
    const [row] = await db
      .update(schema.projects)
      .set({ statusNote: note, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .returning();
    if (!row) throw notFound('project');
    return row;
  },

  async archive(id: string) {
    const [row] = await db
      .update(schema.projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .returning();
    if (!row) throw notFound('project');
    return row;
  },
};
