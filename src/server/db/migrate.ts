/**
 * Apply pending migrations. Run via `pnpm db:migrate` (Node --env-file=.env).
 * Standalone (only needs DATABASE_URL) so it runs in the Docker entrypoint
 * before the app boots.
 *
 * Postgres uses a durable migration history (./drizzle). The sqlite path
 * (DB_DRIVER=sqlite) applies the schema with `drizzle-kit push` instead — see
 * `pnpm db:push:sqlite` — so this script is a no-op there.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  if ((process.env.DB_DRIVER ?? 'postgres') === 'sqlite') {
    console.info('• DB_DRIVER=sqlite — schema is applied via `pnpm db:push:sqlite`; skipping');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run migrations');

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.info('✓ migrations applied');
}

main().catch((err) => {
  console.error('✗ migration failed:', err);
  process.exit(1);
});
