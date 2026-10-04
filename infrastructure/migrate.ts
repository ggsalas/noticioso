import { getDatabase } from "./database";
import { SCHEMA_VERSION, CREATE_TABLES_SQL } from "./schema";

export { SCHEMA_VERSION };

export interface MigrationState {
  version: number;
  completedAt: string;
}

export async function runMigrations(): Promise<void> {
  const db = await getDatabase();

  // Create schema first (idempotent with IF NOT EXISTS)
  // This must happen before querying migration_state
  await db.execAsync(CREATE_TABLES_SQL);

  // Check current migration state
  const stateResult = await db.getFirstAsync<{ version: number } | undefined>(
    "SELECT version FROM migration_state WHERE id = 1"
  );

  const currentVersion = stateResult?.version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    // Already up to date
    return;
  }

  // Update migration state
  await db.runAsync(
    `INSERT OR REPLACE INTO migration_state (id, version, completed_at) VALUES (1, ?, ?)`,
    [SCHEMA_VERSION, new Date().toISOString()]
  );
}

export async function getMigrationState(): Promise<MigrationState | null> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{
    version: number;
    completed_at: string;
  } | undefined>("SELECT version, completed_at FROM migration_state WHERE id = 1");

  if (!result) return null;
  return {
    version: result.version,
    completedAt: result.completed_at,
  };
}
