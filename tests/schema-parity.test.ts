import { describe, test, expect } from 'vitest';
import { is, Table, getTableColumns } from 'drizzle-orm';
import * as pgSchema from '@/server/db/schema';
import * as sqliteSchema from '@/server/db/schema.sqlite';

/**
 * Guards the `as unknown as typeof pgSchema` cast in src/server/db/index.ts:
 * the Postgres and SQLite schemas MUST stay structurally identical (same
 * tables, same column names per table). The cast deliberately suppresses the
 * type error that would otherwise fire on drift — so without this test, adding
 * a column to schema.ts and forgetting schema.sqlite.ts would keep typecheck
 * green, keep Postgres working, and silently break the sqlite driver at runtime.
 */
function tableColumns(mod: Record<string, unknown>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [exportName, val] of Object.entries(mod)) {
    if (is(val, Table)) out.set(exportName, Object.keys(getTableColumns(val)).sort());
  }
  return out;
}

describe('schema parity (postgres ↔ sqlite)', () => {
  const pg = tableColumns(pgSchema);
  const sqlite = tableColumns(sqliteSchema);

  test('both schemas export the same set of tables', () => {
    expect([...sqlite.keys()].sort()).toEqual([...pg.keys()].sort());
  });

  for (const [name, pgCols] of pg) {
    test(`table "${name}" has identical columns`, () => {
      expect(sqlite.get(name), `sqlite schema is missing table "${name}"`).toEqual(pgCols);
    });
  }
});
