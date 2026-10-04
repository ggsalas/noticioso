import { getDatabase } from "./database";

/**
 * Tracks completion of data migrations (separate from schema migrations).
 * This prevents re-running data migrations after the user clears caches.
 */
export class DataMigrationRepository {
  /**
   * Check if a specific data migration has been completed.
   */
  async isCompleted(migrationName: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ completed: number }>(
      `SELECT 1 as completed FROM data_migrations WHERE name = ?`,
      migrationName
    );
    return row !== null && row.completed === 1;
  }

  /**
   * Mark a data migration as completed.
   */
  async markCompleted(migrationName: string): Promise<void> {
    const db = await getDatabase();
    const completedAt = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO data_migrations (name, completed_at) VALUES (?, ?)`,
      migrationName,
      completedAt
    );
  }
}

export const dataMigrationRepository = new DataMigrationRepository();
