import { getDatabase } from "./database";
import { SCHEMA_VERSION, CREATE_TABLES_SQL_V1 } from "./schema";

export { SCHEMA_VERSION };

export interface MigrationState {
  version: number;
  completedAt: string;
}

/**
 * Run schema migrations in order.
 * Each version migration is wrapped in a transaction for atomicity.
 * Idempotent: safe to call multiple times.
 *
 * Stage 1 (feed_cache, last_full_refresh, data_migrations, migration_state) was never in production.
 * Any existing Stage 1 database is dropped and recreated with the clean baseline schema.
 */
export async function runMigrations(): Promise<void> {
  const db = await getDatabase();

  // Check if this is an old Stage 1 database by looking for legacy tables
  const hasLegacyTables = await checkLegacyTablesExist();

  if (hasLegacyTables) {
    // Stage 1 database detected - drop all tables and recreate with clean baseline
    await dropAllTables();
  }

  // Create the clean baseline schema (V1)
  await db.execAsync(CREATE_TABLES_SQL_V1);
}

/**
 * Check if legacy Stage 1 tables exist in the database
 */
async function checkLegacyTablesExist(): Promise<boolean> {
  const db = await getDatabase();

  try {
    // Check for any of the legacy tables
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sqlite_master
       WHERE type='table' AND name IN ('feed_cache', 'last_full_refresh', 'data_migrations', 'migration_state')`
    );
    return (result?.count ?? 0) > 0;
  } catch {
    // Table doesn't exist or other error
    return false;
  }
}

/**
 * Drop all tables in the database
 * Used to reset Stage 1 databases to clean baseline
 */
async function dropAllTables(): Promise<void> {
  const db = await getDatabase();

  try {
    // Get all table names
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    // Disable foreign keys temporarily for clean drop
    await db.execAsync("PRAGMA foreign_keys = OFF");

    // Drop each table
    for (const table of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table.name}`);
    }

    // Re-enable foreign keys
    await db.execAsync("PRAGMA foreign_keys = ON");
  } catch (error) {
    // Ensure foreign keys are re-enabled even if drop fails
    await db.execAsync("PRAGMA foreign_keys = ON");
    throw error;
  }
}
