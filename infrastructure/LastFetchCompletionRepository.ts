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
}

export const lastFetchCompletionRepository = new LastFetchCompletionRepository();
