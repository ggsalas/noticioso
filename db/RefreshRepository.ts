import { getDatabase } from "./database";

/**
 * Read access to the refresh pointers. All of them are single-row tables written
 * by the native module.
 *
 * - active:  the generation the user currently sees
 * - pending: a READY generation waiting for the user to apply it (toast)
 * - last fetch completion: when the last feed pass finished (1h staleness check)
 */
export class RefreshRepository {
  async getActive(): Promise<{ refreshId: string; appliedAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<
      { refresh_id: string; applied_at: string } | undefined
    >("SELECT refresh_id, applied_at FROM active_refresh WHERE id = 1");

    if (!row) return null;
    return { refreshId: row.refresh_id, appliedAt: row.applied_at };
  }

  async getPending(): Promise<{ refreshId: string; readyAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<
      { refresh_id: string; ready_at: string } | undefined
    >("SELECT refresh_id, ready_at FROM pending_refresh WHERE id = 1");

    if (!row || !row.refresh_id) return null;
    return { refreshId: row.refresh_id, readyAt: row.ready_at };
  }

  async getLastFetchCompletion(): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ completed_at: string } | undefined>(
      "SELECT completed_at FROM last_fetch_completion WHERE id = 1",
    );
    return row?.completed_at ?? null;
  }

  /**
   * Articles of a generation whose download was already attempted, by URL:
   * "completed" or "failed" (failed jobs are never retried).
   */
  async getAttemptedArticles(
    refreshId: string,
  ): Promise<Map<string, "completed" | "failed">> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ url: string; status: "completed" | "failed" }>(
      `SELECT url, status FROM article_download_jobs
       WHERE refresh_id = ? AND status IN ('completed', 'failed')`,
      [refreshId],
    );
    return new Map(rows.map((row) => [row.url, row.status]));
  }
}

export const refreshRepository = new RefreshRepository();
