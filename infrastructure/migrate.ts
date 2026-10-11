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
    // After drop, create full v3 schema (fresh install path)
    await db.execAsync(CREATE_TABLES_SQL_V1);
    await migrateToV2();
    await migrateToV3();
    return;
  }

  // Create the clean baseline schema (V1) if tables don't exist yet
  await db.execAsync(CREATE_TABLES_SQL_V1);

  // Apply incremental migrations
  await migrateToV2();
  await migrateToV3();
}

/**
 * Migration v1 → v2: Add article_download_jobs table for Stage 3 native article downloader
 * Idempotent: uses IF NOT EXISTS to safely run multiple times.
 */
async function migrateToV2(): Promise<void> {
  const db = await getDatabase();

  // Create the article_download_jobs table (legacy single-column PK for fresh v2 installs)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS article_download_jobs (
      url TEXT PRIMARY KEY,
      refresh_id TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'downloading', 'completed', 'failed')),
      file_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // Create indexes separately to ensure they're created
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_article_download_jobs_refresh_id ON article_download_jobs(refresh_id)`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_article_download_jobs_status ON article_download_jobs(status)`
  );
}

/**
 * Migration v2 → v3:
 * 1. Change article_download_jobs primary key from (url) to (refresh_id, url) compound key
 * 2. Add position column to refresh_feeds for feed ordering
 *
 * This is a breaking schema change for the primary key, so we need to recreate the table.
 * Data is preserved via INSERT OR IGNORE to handle any duplicates.
 */
async function migrateToV3(): Promise<void> {
  const db = await getDatabase();

  // Check if migration already applied (table already has compound PK)
  const tableInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(article_download_jobs)`
  );

  const hasCompoundPK = tableInfo.filter(col => col.name === 'refresh_id' || col.name === 'url').length === 2 &&
                         tableInfo.some(col => col.name === 'refresh_id' && (col as any).pk > 0) &&
                         tableInfo.some(col => col.name === 'url' && (col as any).pk > 0);

  if (!hasCompoundPK && tableInfo.length > 0) {
    // Migrate article_download_jobs to compound primary key
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS article_download_jobs_new (
        refresh_id TEXT NOT NULL,
        url TEXT NOT NULL,
        feed_url TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'downloading', 'completed', 'failed')),
        file_path TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (refresh_id, url)
      )
    `);

    // Copy data from old table
    await db.execAsync(`
      INSERT OR IGNORE INTO article_download_jobs_new
      (refresh_id, url, feed_url, status, file_path, error_message, created_at, completed_at)
      SELECT refresh_id, url, feed_url, status, file_path, error_message, created_at, completed_at
      FROM article_download_jobs
    `);

    // Drop old table
    await db.execAsync(`DROP TABLE IF EXISTS article_download_jobs`);

    // Rename new table
    await db.execAsync(`ALTER TABLE article_download_jobs_new RENAME TO article_download_jobs`);

    // Recreate indexes
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_article_download_jobs_refresh_id ON article_download_jobs(refresh_id)`
    );
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_article_download_jobs_status ON article_download_jobs(status)`
    );
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_article_download_jobs_url ON article_download_jobs(url)`
    );
  }

  // Add position column to refresh_feeds if it doesn't exist
  const refreshFeedsInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(refresh_feeds)`
  );

  const hasPositionColumn = refreshFeedsInfo.some(col => col.name === 'position');

  if (!hasPositionColumn && refreshFeedsInfo.length > 0) {
    await db.execAsync(`ALTER TABLE refresh_feeds ADD COLUMN position INTEGER DEFAULT 0`);

    // Backfill position column preserving insertion order per refresh_id.
    // Order by rowid to preserve insertion order, but use primary key (refresh_id, feed_url) for updates.
    // Idempotent: deterministic values based on insertion order, safe to re-run.
    const allRows = await db.getAllAsync<{ refresh_id: string; feed_url: string }>(
      `SELECT refresh_id, feed_url FROM refresh_feeds ORDER BY refresh_id, rowid`
    );

    let currentRefreshId: string | null = null;
    let currentPosition = 0;

    for (const row of allRows) {
      if (row.refresh_id !== currentRefreshId) {
        currentRefreshId = row.refresh_id;
        currentPosition = 0;
      }

      await db.runAsync(
        `UPDATE refresh_feeds SET position = ? WHERE refresh_id = ? AND feed_url = ?`,
        [currentPosition, row.refresh_id, row.feed_url]
      );

      currentPosition++;
    }
  }
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
