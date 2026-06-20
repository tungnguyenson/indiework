import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import type { Role } from '@/server/auth/ctx';

/**
 * Workspace membership = the tenant boundary (authorization-design.md §3). One
 * row per (user, workspace) carrying the user's RBAC role. The Ctx resolver
 * calls `roleOf` to validate membership and pull the role.
 */
export const memberService = {
  /**
   * The caller's role in a workspace, or null when they are not an ACTIVE
   * member (no row, or status invited/suspended). Null ⇒ the resolver throws
   * unauthorized, so a non-member never reaches a service.
   */
  async roleOf(userId: string, workspaceId: string): Promise<Role | null> {
    const [row] = await db
      .select({ role: schema.workspaceMembers.role, status: schema.workspaceMembers.status })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.userId, userId),
          eq(schema.workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!row || row.status !== 'active') return null;
    return row.role;
  },

  /** Active memberships for a user, with each workspace row (for the switcher). */
  async listForUser(userId: string) {
    return db
      .select({
        workspace: schema.workspaces,
        role: schema.workspaceMembers.role,
        status: schema.workspaceMembers.status,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
      )
      .where(
        and(
          eq(schema.workspaceMembers.userId, userId),
          eq(schema.workspaceMembers.status, 'active'),
        ),
      )
      .orderBy(schema.workspaces.createdAt);
  },

  /**
   * Idempotent: ensure a (user, workspace) membership exists with the given
   * role. Used by bootstrap/backfill. Does NOT downgrade an existing role.
   */
  async ensureMembership(userId: string, workspaceId: string, role: Role): Promise<void> {
    const [existing] = await db
      .select({ id: schema.workspaceMembers.id })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.userId, userId),
          eq(schema.workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (existing) return;

    await db.insert(schema.workspaceMembers).values({
      userId,
      workspaceId,
      role,
      status: 'active',
      joinedAt: new Date(),
    });
  },
};
