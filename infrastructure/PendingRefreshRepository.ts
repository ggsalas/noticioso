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
}

export const pendingRefreshRepository = new PendingRefreshRepository();
