import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { createAttachmentSchema } from '@/server/validators/attachment';
import { notFound } from './errors';

export type AttachmentRow = typeof schema.attachments.$inferSelect;

/**
 * Attachment metadata. NOTE: file *bytes* are not yet stored — `path` stays null
 * until the storage backend is wired (deferred). This service manages the
 * metadata rows + the detail-panel UI; uploads currently persist name/type/size
 * only. See docs/v3-implementation-plan.md §Phase 7.
 */
export const attachmentService = {
  async list(taskId: string): Promise<AttachmentRow[]> {
    return db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, taskId))
      .orderBy(asc(schema.attachments.createdAt));
  },

  async add(input: unknown): Promise<AttachmentRow> {
    const data = createAttachmentSchema.parse(input);
    const [row] = await db
      .insert(schema.attachments)
      .values({
        taskId: data.taskId,
        name: data.name,
        type: data.type,
        size: data.size ?? null,
        ext: data.ext ?? null,
        // path/url stay null — storage wiring is deferred (TODO)
      })
      .returning();
    return row;
  },

  async remove(id: string): Promise<{ ok: true }> {
    const [row] = await db
      .delete(schema.attachments)
      .where(eq(schema.attachments.id, id))
      .returning({ id: schema.attachments.id });
    if (!row) throw notFound('attachment');
    return { ok: true };
  },

  /** Attachment counts for a set of tasks (one query) → Map<taskId, count>. */
  async countsForProject(projectId: string): Promise<Map<string, number>> {
    const rows = await db
      .select({ taskId: schema.attachments.taskId, count: sql<number>`cast(count(*) as integer)` })
      .from(schema.attachments)
      .innerJoin(schema.tasks, eq(schema.attachments.taskId, schema.tasks.id))
      .where(eq(schema.tasks.projectId, projectId))
      .groupBy(schema.attachments.taskId);
    return new Map(rows.map((r) => [r.taskId, Number(r.count)]));
  },
};
