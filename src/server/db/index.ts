/**
 * DB entry point — selects the driver from `DB_DRIVER` (default `postgres`) and
 * exports a single `db` + `schema` the service layer imports. The service layer
 * never imports a dialect schema directly, only this module, so switching to
 * sqlite (the self-host / public-demo path) is one env var: `DB_DRIVER=sqlite`.
 *
 * Type seam: `./schema` (Postgres) is the canonical TYPE module (dto.ts infers
 * row types from it). Under sqlite we export the *real* sqlite db + sqlite table
 * objects at runtime — they carry the correct dialect SQL + value mappers
 * (Date→epoch, tags→json) — but cast both to the Postgres types so every
 * consumer typechecks against one shape. The two dialect schemas are kept
 * structurally identical (see ./schema.sqlite.ts) to keep that cast honest.
 *
 * Driver choice: the service layer uses async transaction callbacks
 * (`await db.transaction(async (tx) => …)`), which the synchronous better-sqlite3
 * driver cannot run — so sqlite goes through libsql, which supports them.
 */
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient, type Client as LibsqlClient } from '@libsql/client';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '@/server/env';
import * as pgSchema from './schema';
import * as sqliteSchema from './schema.sqlite';

const isSqlite = env.DB_DRIVER === 'sqlite';

// `./schema` (Postgres) is the canonical type module. Under sqlite the runtime
// objects are the sqlite tables (correct SQL + value mapping), cast to the pg
// type so consumers see one shape.
export const schema = (isSqlite ? sqliteSchema : pgSchema) as unknown as typeof pgSchema;

export type DbClient = NodePgDatabase<typeof pgSchema>;
/** A transaction handle, as passed to the `db.transaction(async (tx) => …)` callback. */
export type DbTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

// Reuse driver handles across hot-reloads in dev (avoid exhausting connections /
// re-opening the sqlite file on every reload).
const globalForDb = globalThis as unknown as {
  __iwPool?: Pool;
  __iwSqlite?: LibsqlClient;
};

// The active low-level handle, so `closeDb()` can shut down whichever driver is
// running (used by scripts/tests for a clean teardown).
let activePool: Pool | undefined;
let activeClient: LibsqlClient | undefined;

function createPgDb(): DbClient {
  // Vercel (and similar serverless) spins many short-lived instances. Keep the
  // per-instance pool tiny and pair it with Supabase's transaction pooler
  // (:6543) so we don't exhaust session-mode slots (EMAXCONNSESSION).
  // Long-running hosts (VPS/Docker/local) can share a larger pool.
  const isServerless = Boolean(process.env.VERCEL);
  const pool =
    globalForDb.__iwPool ??
    new Pool({
      connectionString: env.DATABASE_URL,
      max: isServerless ? 1 : 10,
      // Keep TCP alive so idle connections aren't silently dropped (common
      // behind Docker/NAT on macOS), which otherwise surfaces as a one-off
      // "Connection terminated unexpectedly".
      keepAlive: true,
      idleTimeoutMillis: isServerless ? 5_000 : 30_000,
    });

  // Swallow background pool errors so a dropped idle client is evicted and
  // recycled instead of crashing the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  // Cache on globalThis in every env so warm serverless isolates reuse the
  // single client instead of opening a new one per module evaluation.
  globalForDb.__iwPool = pool;
  activePool = pool;

  return drizzlePg(pool, { schema: pgSchema });
}

function createSqliteDb(): DbClient {
  // libsql wants a `file:` URL; ensure the parent dir exists for file DBs.
  const raw = env.SQLITE_PATH ?? './data/iw.db';
  const url = raw === ':memory:' || raw.startsWith('file:') ? raw : `file:${raw}`;
  if (url.startsWith('file:')) {
    mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  }

  const client = globalForDb.__iwSqlite ?? createClient({ url });

  // Cascade deletes (the seed's idempotent reset relies on them) need FK
  // enforcement. libsql defaults it on; set it explicitly as a guard — these are
  // the first statements queued on the client, so they run before any query.
  // busy_timeout: the web/API/MCP surfaces all write through one process, so
  // contention is rare, but it cheaply avoids an occasional SQLITE_BUSY.
  for (const pragma of ['PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 5000']) {
    client.execute(pragma).catch((err) => console.error(`[db] sqlite ${pragma} failed:`, err));
  }

  if (env.NODE_ENV !== 'production') globalForDb.__iwSqlite = client;
  activeClient = client;

  // Runtime is the real libsql db + sqlite tables; cast the handle to the pg
  // type so the service layer stays driver-agnostic (see file header).
  return drizzleLibsql(client, { schema: sqliteSchema }) as unknown as DbClient;
}

export const db: DbClient = isSqlite ? createSqliteDb() : createPgDb();

/** The active driver, for diagnostics / scripts. */
export const DB_DRIVER = env.DB_DRIVER;

/**
 * Close the active database handle (pg pool or libsql client). Driver-agnostic
 * teardown for scripts and tests; the long-running app never needs to call it.
 */
export async function closeDb(): Promise<void> {
  if (activePool) await activePool.end();
  activeClient?.close();
}

/**
 * Allocate the next per-project sequence number (docs/product/scope.md §2, spec §4.9).
 * Call inside the transaction that inserts/assigns the task. Single-user, so
 * never contended; the UPDATE … RETURNING is atomic regardless. Portable across
 * both dialects (UPDATE … RETURNING is supported by Postgres and sqlite ≥3.35).
 */
export async function allocateSeq(tx: DbTx, projectId: string): Promise<number> {
  await tx
    .insert(schema.projectCounters)
    .values({ projectId, nextSeq: 1 })
    .onConflictDoNothing();

  const rows = await tx
    .update(schema.projectCounters)
    .set({ nextSeq: sql`${schema.projectCounters.nextSeq} + 1` })
    .where(eq(schema.projectCounters.projectId, projectId))
    .returning({ next: schema.projectCounters.nextSeq });

  // nextSeq now points at the *next* value; the allocated seq is next − 1.
  return rows[0].next - 1;
}
