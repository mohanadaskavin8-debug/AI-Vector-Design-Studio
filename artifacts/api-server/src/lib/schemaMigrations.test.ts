import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { runSchemaMigrations } from "@workspace/db/migrate";

/**
 * Integration test: verifies the startup schema migrations upgrade a database
 * that is at the PRIOR schema revision (project_assets without `confirmed`),
 * exactly what a deployed database created from the base revision looks like.
 *
 * Runs against DATABASE_URL inside a throwaway schema (via search_path) so the
 * real dev data is untouched. Skipped when no database is available.
 */
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("runSchemaMigrations", () => {
  const scratchSchema = `migration_test_${Math.random().toString(36).slice(2, 10)}`;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${scratchSchema}`,
      max: 1,
    });
    await pool.query(`CREATE SCHEMA "${scratchSchema}"`);
    // project_assets as it existed before the `confirmed` column was added.
    await pool.query(`CREATE TABLE "${scratchSchema}"."project_assets" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      owner_id text NOT NULL,
      object_path text NOT NULL UNIQUE,
      kind text NOT NULL,
      name text NOT NULL,
      content_type text NOT NULL,
      size bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(
      `INSERT INTO "${scratchSchema}"."project_assets"
         (project_id, owner_id, object_path, kind, name, content_type, size)
       VALUES (gen_random_uuid(), 'user-1', 'assets/pre-existing.png', 'image', 'pre-existing', 'image/png', 10)`,
    );
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE`);
    await pool.end();
  });

  it("adds project_assets.confirmed when upgrading from the prior schema revision", async () => {
    const result = await runSchemaMigrations(pool);
    expect(result.ensured).toContain("2026-09-02-project-assets-confirmed");

    const { rows } = await pool.query(
      `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'project_assets' AND column_name = 'confirmed'`,
      [scratchSchema],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("boolean");
    expect(rows[0].is_nullable).toBe("NO");
    expect(rows[0].column_default).toBe("false");

    // Rows that predate the migration get the safe default (never served).
    const preExisting = await pool.query(
      `SELECT confirmed FROM "project_assets" WHERE object_path = 'assets/pre-existing.png'`,
    );
    expect(preExisting.rows[0].confirmed).toBe(false);

    // The exact insert shape the API uses (explicit confirmed) works post-upgrade.
    await pool.query(
      `INSERT INTO "project_assets"
         (project_id, owner_id, object_path, kind, name, content_type, size, confirmed)
       VALUES (gen_random_uuid(), 'user-1', 'assets/new-upload.png', 'image', 'new-upload', 'image/png', 1, false)`,
    );
    const inserted = await pool.query(
      `SELECT confirmed FROM "project_assets" WHERE object_path = 'assets/new-upload.png'`,
    );
    expect(inserted.rows[0].confirmed).toBe(false);
  });

  it("is idempotent on an already-migrated database", async () => {
    await expect(runSchemaMigrations(pool)).resolves.toEqual({
      ensured: ["2026-09-02-project-assets-confirmed"],
    });
  });

  it("is a no-op on a fresh database where the table does not exist yet", async () => {
    const emptySchema = `${scratchSchema}_empty`;
    await pool.query(`CREATE SCHEMA "${emptySchema}"`);
    const freshPool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${emptySchema}`,
      max: 1,
    });
    try {
      await expect(runSchemaMigrations(freshPool)).resolves.toBeTruthy();
      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
        [emptySchema],
      );
      expect(rows).toHaveLength(0); // nothing created out of thin air
    } finally {
      await freshPool.end();
      await pool.query(`DROP SCHEMA "${emptySchema}" CASCADE`);
    }
  });
});
