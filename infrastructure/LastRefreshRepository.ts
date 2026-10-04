import { getDatabase } from "./database";

export class LastRefreshRepository {
  async get(): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ timestamp: string } | undefined>(
      "SELECT timestamp FROM last_full_refresh WHERE id = 1"
    );
    return row?.timestamp ?? null;
  }

  async set(timestamp: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO last_full_refresh (id, timestamp) VALUES (1, ?)",
      [timestamp]
    );
  }

  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM last_full_refresh");
  }
}

export const lastRefreshRepository = new LastRefreshRepository();
