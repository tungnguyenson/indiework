/**
 * Idempotent seed: ensure workspace, admin user, default-agent, legacy api_key,
 * and backfill attribution on legacy rows. Run via `pnpm db:seed`.
 *
 * Goes through the driver-aware `db`/`schema` (see ./index.ts), so it works
 * under both `DB_DRIVER=postgres` and `DB_DRIVER=sqlite` with no changes.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { env } from '@/server/env';
import { apiKeyService, userService } from '@/server/services';
import { db, schema } from '@/server/db';

async function ensureWorkspace() {
  const existing = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.workspaces).values({
      name: 'My Workspace',
      emoji: '◈',
      tagline: 'personal projects',
    });
    console.info('✓ seeded default workspace');
  } else {
    console.info('• workspace already present');
  }
}

/** First-created workspace = the single-user "default" home. */
async function defaultWorkspaceId(): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .orderBy(schema.workspaces.createdAt)
    .limit(1);
  return row?.id ?? null;
}

/** Idempotent: ensure a (user, workspace) membership row with the given role. */
async function ensureMembershipRow(
  userId: string,
  workspaceId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer',
): Promise<void> {
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
}

/**
 * P1 tenant-boundary backfill (idempotent, driver-agnostic). The Postgres
 * migration 0005 already does this durably for the pg path; running it here too
 * is a no-op on pg and the *only* backfill for the sqlite path (which has no
 * durable migration history — schema is applied via `drizzle-kit push`).
 */
async function backfillTenancy() {
  const wsId = await defaultWorkspaceId();
  if (!wsId) return;

  // 1) Account type: legacy 'admin' → 'human' (RBAC now on workspace_members).
  //    The WHERE uses a raw `sql` predicate because 'admin' is no longer in the
  //    USER_ROLE enum, so a typed `eq(users.role, 'admin')` won't accept it.
  //    Runs on both dialects through the unified `db`.
  await db
    .update(schema.users)
    .set({ role: 'human' })
    .where(sql`${schema.users.role} = 'admin'`);

  // 2) Every workspace defaults to the solo tier.
  await db.update(schema.workspaces).set({ plan: 'solo' }).where(isNull(schema.workspaces.plan));

  // 3) Scope project tasks to their project's workspace.
  const projects = await db
    .select({ id: schema.projects.id, workspaceId: schema.projects.workspaceId })
    .from(schema.projects);
  for (const p of projects) {
    await db
      .update(schema.tasks)
      .set({ workspaceId: p.workspaceId ?? wsId })
      .where(and(eq(schema.tasks.projectId, p.id), isNull(schema.tasks.workspaceId)));
  }
  // 4) Remaining (Inbox + null-workspace) tasks → default workspace.
  await db.update(schema.tasks).set({ workspaceId: wsId }).where(isNull(schema.tasks.workspaceId));

  // 5) First human user → OWNER of the default workspace (membership bootstrap).
  const [firstHuman] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'human'))
    .orderBy(schema.users.createdAt)
    .limit(1);
  if (firstHuman) await ensureMembershipRow(firstHuman.id, wsId, 'owner');

  // 6) Every agent user → MEMBER of the default workspace. Without this,
  //    ctxFromBearer(roleOf=null) would 401 every MCP/REST call (design §11).
  const agents = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'agent'));
  for (const a of agents) await ensureMembershipRow(a.id, wsId, 'member');

  console.info('✓ backfilled tenant boundary (members, task workspace, plan)');
}

async function ensureUsers() {
  const adminId = await userService.ensureAdmin(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  console.info('✓ ensured admin user');

  const agentId = await userService.ensureDefaultAgent();
  console.info('✓ ensured default-agent user');

  await apiKeyService.ensureLegacyToken(env.API_TOKEN, agentId);
  console.info('✓ ensured legacy API_TOKEN api_key');

  await userService.backfillAttribution(adminId, agentId);
  console.info('✓ backfilled createdById on legacy tasks/comments');
}

async function main() {
  await ensureWorkspace();
  await ensureUsers();
  await backfillTenancy();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ seed failed:', err);
    process.exit(1);
  });
