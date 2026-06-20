import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { notFound } from './errors';

export const DEFAULT_AGENT_NAME = 'default-agent';

export type UserRow = typeof schema.users.$inferSelect;

export type UserPublic = Pick<UserRow, 'id' | 'email' | 'name' | 'role'>;

function toPublic(row: UserRow): UserPublic {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export const userService = {
  async getById(id: string): Promise<UserPublic | null> {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return row && !row.disabledAt ? toPublic(row) : null;
  },

  async getByIds(ids: string[]): Promise<Map<string, UserPublic>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, ids));
    return new Map(rows.filter((r) => !r.disabledAt).map((r) => [r.id, toPublic(r)]));
  },

  async getByEmail(email: string): Promise<UserRow | null> {
    const normalized = email.trim().toLowerCase();
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalized))
      .limit(1);
    return row ?? null;
  },

  async getDefaultAgentId(): Promise<string> {
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.name, DEFAULT_AGENT_NAME))
      .limit(1);
    if (!row) throw notFound('default agent');
    return row.id;
  },

  async verifyLogin(email: string, password: string): Promise<UserPublic | null> {
    const row = await this.getByEmail(email);
    if (!row || row.disabledAt || row.role !== 'admin' || !row.passwordHash) return null;
    if (!(await verifyPassword(password, row.passwordHash))) return null;
    return toPublic(row);
  },

  /** Idempotent: ensure the seed admin exists. Returns the user id. */
  async ensureAdmin(email: string, password: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.getByEmail(normalized);
    if (existing) return existing.id;

    const passwordHash = await hashPassword(password);
    const [row] = await db
      .insert(schema.users)
      .values({
        email: normalized,
        name: 'Admin',
        role: 'admin',
        passwordHash,
      })
      .returning({ id: schema.users.id });
    return row.id;
  },

  /**
   * Overwrite the admin password hash from env (e.g. after changing ADMIN_PASSWORD).
   * Does not touch tasks, comments, or any other data.
   */
  async resetAdminPassword(email: string, password: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    const [row] = await db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(schema.users.email, normalized), eq(schema.users.role, 'admin')))
      .returning({ id: schema.users.id });
    if (!row) throw notFound(`admin with email ${normalized}`);
  },

  /** Idempotent: ensure the back-compat default agent exists. */
  async ensureDefaultAgent(): Promise<string> {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.name, DEFAULT_AGENT_NAME))
      .limit(1);
    if (existing) return existing.id;

    const [row] = await db
      .insert(schema.users)
      .values({
        email: null,
        name: DEFAULT_AGENT_NAME,
        role: 'agent',
        passwordHash: null,
      })
      .returning({ id: schema.users.id });
    return row.id;
  },

  /** Return the first active admin (for backfill). */
  async getFirstAdminId(): Promise<string | null> {
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, 'admin'))
      .limit(1);
    return row?.id ?? null;
  },

  /** Backfill createdById on legacy rows (idempotent). */
  async backfillAttribution(adminId: string, agentId: string): Promise<void> {
    await db
      .update(schema.tasks)
      .set({ createdById: adminId })
      .where(isNull(schema.tasks.createdById));

    await db
      .update(schema.comments)
      .set({ createdById: agentId })
      .where(
        and(isNull(schema.comments.createdById), inArray(schema.comments.source, ['mcp', 'agent'])),
      );

    await db
      .update(schema.comments)
      .set({ createdById: adminId })
      .where(
        and(isNull(schema.comments.createdById), inArray(schema.comments.source, ['web', 'api'])),
      );
  },
};
