import { getDatabase } from "./database";
import type { FeedData } from "~/types";

export interface FeedCacheRow {
  url: string;
  data: string; // JSON stringified FeedData
  cachedAt: string; // ISO timestamp
}

export class FeedCacheRepository {
  async get(url: string): Promise<{ data: FeedData; cachedAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<FeedCacheRow | undefined>(
      "SELECT url, data, cached_at as cachedAt FROM feed_cache WHERE url = ?",
      [url]
    );

    if (!row) return null;

    try {
      const data = JSON.parse(row.data) as FeedData;
      return { data, cachedAt: row.cachedAt };
    } catch {
      return null;
    }
  }

  async set(url: string, data: FeedData, cachedAt?: string): Promise<void> {
    const db = await getDatabase();
    const effectiveCachedAt = cachedAt ?? new Date().toISOString();
    const dataJson = JSON.stringify(data);

    await db.runAsync(
      `INSERT OR REPLACE INTO feed_cache (url, data, cached_at) VALUES (?, ?, ?)`,
      [url, dataJson, effectiveCachedAt]
    );
  }

  async delete(url: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM feed_cache WHERE url = ?", [url]);
  }

  async getAll(): Promise<Array<{ url: string; data: FeedData; cachedAt: string }>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<FeedCacheRow>(
      "SELECT url, data, cached_at as cachedAt FROM feed_cache"
    );

    return rows
      .map((row) => {
        try {
          const data = JSON.parse(row.data) as FeedData;
          return { url: row.url, data, cachedAt: row.cachedAt };
        } catch {
          return null;
        }
      })
      .filter((item): item is { url: string; data: FeedData; cachedAt: string } => item !== null);
  }

  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM feed_cache");
  }
}

export const feedCacheRepository = new FeedCacheRepository();
