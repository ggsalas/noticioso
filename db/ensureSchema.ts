import { getDatabase } from "./database";
import { SCHEMA_VERSION, CREATE_TABLES_SQL } from "./schema";

export { SCHEMA_VERSION };

/**
 * Make sure noticioso.db has the current schema. Runs at startup, before the
 * native module is used.
 *
 * No migrations: the database is a cache the native module rebuilds (see
 * db/README.md, "No migrations"). The schema version is stored in SQLite's
 * `PRAGMA user_version`:
 * - same version  -> nothing to do (tables are created if missing)
 * - other version -> drop every table and create the current schema
 *   (a new install has version 0 and no tables, so it takes this path too)
 *
 * The version is written last, so an interrupted rebuild is redone on the next
 * start. Idempotent.
 */
export async function ensureSchema(): Promise<void> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if ((row?.user_version ?? 0) !== SCHEMA_VERSION) {
    await dropAllTables();
  }

  await db.execAsync(CREATE_TABLES_SQL);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function dropAllTables(): Promise<void> {
  const db = await getDatabase();
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );

  // Foreign keys off so tables can be dropped in any order
  await db.execAsync("PRAGMA foreign_keys = OFF");
  try {
    for (const table of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS "${table.name}"`);
    }
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON");
  }
}
