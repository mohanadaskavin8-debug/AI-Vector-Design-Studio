import type pg from "pg";

/**
 * Ordered, idempotent schema upgrades for databases provisioned at an older
 * schema revision.
 *
 * `drizzle-kit push` (dev-only) always creates the full current schema, so a
 * fresh database never needs these. A deployed database created from an
 * earlier revision does: the API refuses to serve until these have run (see
 * the api-server entrypoint), so every statement must be safe to re-run and
 * safe on a database where the table does not exist yet (`IF EXISTS` /
 * `IF NOT EXISTS` guards).
 *
 * Add new entries at the end; never edit or reorder existing ones.
 */
const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  {
    id: "2026-09-02-project-assets-confirmed",
    sql: `ALTER TABLE IF EXISTS "project_assets" ADD COLUMN IF NOT EXISTS "confirmed" boolean NOT NULL DEFAULT false`,
  },
];

// Serializes concurrent instances (e.g. overlapping deploys) on one advisory
// lock so DDL never races. Arbitrary but stable app-specific key pair.
const LOCK_KEY_1 = 727150;
const LOCK_KEY_2 = 993021;

/**
 * Runs all schema migrations against the given pool. Resolves with the ids of
 * the ensured migrations, or rejects (naming the failing migration) — callers
 * must treat rejection as fatal rather than serving against an unknown schema.
 */
export async function runSchemaMigrations(pool: pg.Pool): Promise<{ ensured: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
    try {
      const ensured: string[] = [];
      for (const migration of MIGRATIONS) {
        try {
          await client.query(migration.sql);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          throw new Error(`Schema migration "${migration.id}" failed: ${detail}`, { cause: err });
        }
        ensured.push(migration.id);
      }
      return { ensured };
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2])
        .catch(() => undefined); // session-scoped lock: released on disconnect anyway
    }
  } finally {
    client.release();
  }
}
