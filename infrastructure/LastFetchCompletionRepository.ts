import { getDatabase } from "./database";

export class LastFetchCompletionRepository {
  /**
   * Get the last fetch completion timestamp
   */
  async get(): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ completed_at: string } | undefined>(
      "SELECT completed_at FROM last_fetch_completion WHERE id = 1"
    );
    return row?.completed_at ?? null;
  }

  /**
   * Set the last fetch completion timestamp
   */
  async set(timestamp: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO last_fetch_completion (id, completed_at) VALUES (1, ?)",
      [timestamp]
    );
  }

  /**
   * Clear the last fetch completion (for testing)
   */
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM last_fetch_completion");
  }
}

export const lastFetchCompletionRepository = new LastFetchCompletionRepository();
