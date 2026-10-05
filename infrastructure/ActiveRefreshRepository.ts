import { getDatabase } from "./database";

export class ActiveRefreshRepository {
  /**
   * Get the currently active refresh ID
   */
  async get(): Promise<{ refreshId: string; appliedAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      refresh_id: string;
      applied_at: string;
    } | undefined>(
      "SELECT refresh_id, applied_at FROM active_refresh WHERE id = 1"
    );

    if (!row) return null;

    return {
      refreshId: row.refresh_id,
      appliedAt: row.applied_at,
    };
  }

  /**
   * Set the active refresh (called when toast is tapped to apply)
   */
  async set(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO active_refresh (id, refresh_id, applied_at)
       VALUES (1, ?, ?)`,
      [refreshId, now]
    );
  }

  /**
   * Clear the active refresh pointer (for testing)
   */
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM active_refresh");
  }
}

export const activeRefreshRepository = new ActiveRefreshRepository();
