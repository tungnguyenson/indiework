/**
 * Idempotent seed: ensure one default workspace exists so the app shell always
 * has a workspace to render. Run via `pnpm db:seed`.
 *
 * Goes through the driver-aware `db`/`schema` (see ./index.ts), so it works
 * under both `DB_DRIVER=postgres` and `DB_DRIVER=sqlite` with no changes.
 */
import { db, schema } from '@/server/db';

async function main() {
  const existing = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.workspaces).values({
      name: 'My Workspace',
      emoji: '◈',
      tagline: 'personal projects',
    });
    console.info('✓ seeded default workspace');
  } else {
    console.info('• workspace already present, nothing to seed');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ seed failed:', err);
    process.exit(1);
  });
