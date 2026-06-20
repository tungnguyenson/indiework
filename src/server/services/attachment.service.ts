import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import {
  extFromName,
  humanAttachmentSize,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
} from '@/server/attachment-limits';
import { getObjectStorage } from '@/server/storage';
import { createAttachmentSchema } from '@/server/validators/attachment';
import { newUuid } from '@/lib/uuid';
import { ATTACHMENT_TYPE } from '@/lib/domain';
import { badRequest, notFound } from './errors';

export type AttachmentRow = typeof schema.attachments.$inferSelect;

function attachmentType(contentType: string): (typeof ATTACHMENT_TYPE)[number] {
  return contentType.startsWith('image/') ? 'image' : 'file';
}

export const attachmentService = {
  async list(taskId: string): Promise<AttachmentRow[]> {
    return db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, taskId))
      .orderBy(asc(schema.attachments.createdAt));
  },

  async get(id: string): Promise<AttachmentRow> {
    const [row] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, id)).limit(1);
    if (!row) throw notFound('attachment');
    return row;
  },

  /** Metadata-only row (legacy / seed). Prefer `upload` for real files. */
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
      })
      .returning();
    return row;
  },

  /** Upload bytes to object storage and persist metadata with a storage `path`. */
  async upload(input: {
    taskId: string;
    name: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<AttachmentRow> {
    if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw badRequest(`File exceeds the ${humanAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
    }

    const name = sanitizeAttachmentName(input.name);
    const ext = extFromName(name) || null;
    const type = attachmentType(input.contentType);
    const size = humanAttachmentSize(input.bytes.byteLength);
    const id = newUuid();
    const storage = getObjectStorage();
    const path = storage.objectKey(id);

    await storage.put(path, input.bytes, input.contentType || 'application/octet-stream');

    try {
      const [row] = await db
        .insert(schema.attachments)
        .values({
          id,
          taskId: input.taskId,
          name,
          type,
          size,
          ext,
          path,
        })
        .returning();
      return row;
    } catch (e) {
      await storage.delete(path).catch(() => undefined);
      throw e;
    }
  },

  async open(id: string): Promise<{ row: AttachmentRow; body: Uint8Array; contentType: string }> {
    const row = await this.get(id);
    if (!row.path) throw notFound('attachment file');
    const storage = getObjectStorage();
    const obj = await storage.get(row.path);
    return {
      row,
      body: obj.body,
      contentType: obj.contentType ?? 'application/octet-stream',
    };
  },

  async remove(id: string): Promise<{ ok: true }> {
    const row = await this.get(id);
    if (row.path) {
      await getObjectStorage()
        .delete(row.path)
        .catch(() => undefined);
    }
    await db.delete(schema.attachments).where(eq(schema.attachments.id, id));
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
