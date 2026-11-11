import { getDatabase } from "./database";
import type { FeedData } from "~/types";

export interface FeedSnapshotRow {
  refreshId: string;
  feedUrl: string;
  data: string; // JSON stringified FeedData
  cachedAt: string; // ISO timestamp
}

export class FeedSnapshotRepository {
  /**
   * Get a feed snapshot for a specific refresh
   */
  async get(
    refreshId: string,
    feedUrl: string
  ): Promise<{ data: FeedData; cachedAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ data: string; cached_at: string } | undefined>(
      `SELECT data, cached_at FROM feed_snapshots
       WHERE refresh_id = ? AND feed_url = ?`,
      [refreshId, feedUrl]
    );

    if (!row) return null;

    try {
      const data = JSON.parse(row.data) as FeedData;
      return { data, cachedAt: row.cached_at };
    } catch {
      return null;
    }
  }

  /**
   * Get all feed snapshots for a refresh, ordered by feed_url
   */
  async getAllForRefresh(
    refreshId: string
  ): Promise<Array<{ feedUrl: string; data: FeedData; cachedAt: string }>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      feed_url: string;
      data: string;
      cached_at: string;
    }>(
      `SELECT feed_url, data, cached_at FROM feed_snapshots
       WHERE refresh_id = ?
       ORDER BY feed_url`,
      [refreshId]
    );

    return rows
      .map((row) => {
        try {
          const data = JSON.parse(row.data) as FeedData;
          return { feedUrl: row.feed_url, data, cachedAt: row.cached_at };
        } catch {
          return null;
        }
      })
      .filter(
        (item): item is { feedUrl: string; data: FeedData; cachedAt: string } =>
          item !== null
      );
  }
}

export const feedSnapshotRepository = new FeedSnapshotRepository();
