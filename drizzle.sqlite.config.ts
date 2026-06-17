import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineConfig } from 'drizzle-kit';

/**
 * SQLite (libsql) config for the `DB_DRIVER=sqlite` deploy. The schema is
 * applied with `drizzle-kit push` (no durable migration history — the demo /
 * self-host DB is throwaway), so there is no `out` migrations folder here.
 * The Postgres app keeps using drizzle.config.ts + ./drizzle.
 */
const sqlitePath = process.env.SQLITE_PATH ?? './data/iw.db';

// libsql won't create the parent directory; ensure it exists before push/studio.
mkdirSync(dirname(sqlitePath), { recursive: true });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.sqlite.ts',
  dbCredentials: {
    url: sqlitePath.startsWith('file:') ? sqlitePath : `file:${sqlitePath}`,
  },
  casing: 'snake_case',
});
