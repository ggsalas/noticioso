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
}

export const activeRefreshRepository = new ActiveRefreshRepository();
