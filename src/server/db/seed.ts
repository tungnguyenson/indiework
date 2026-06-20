/**
 * Idempotent seed: ensure workspace, admin user, default-agent, legacy api_key,
 * and backfill attribution on legacy rows. Run via `pnpm db:seed`.
 *
 * Goes through the driver-aware `db`/`schema` (see ./index.ts), so it works
 * under both `DB_DRIVER=postgres` and `DB_DRIVER=sqlite` with no changes.
 */
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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ seed failed:', err);
    process.exit(1);
  });
