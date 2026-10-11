import { getDatabase } from "./database";

export class PendingRefreshRepository {
  /**
   * Get the pending (READY) refresh ID
   */
  async get(): Promise<{ refreshId: string; readyAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      refresh_id: string;
      ready_at: string;
    } | undefined>(
      "SELECT refresh_id, ready_at FROM pending_refresh WHERE id = 1"
    );

    if (!row || !row.refresh_id) return null;

    return {
      refreshId: row.refresh_id,
      readyAt: row.ready_at,
    };
  }

  /**
   * Set the pending refresh (called when native worker completes)
   */
  async set(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO pending_refresh (id, refresh_id, ready_at)
       VALUES (1, ?, ?)`,
      [refreshId, now]
    );
  }

  /**
   * Clear the pending refresh (called when toast is tapped to apply)
   */
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM pending_refresh");
  }
}

export const pendingRefreshRepository = new PendingRefreshRepository();
