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
   * Store a feed snapshot for a refresh
   */
  async set(
    refreshId: string,
    feedUrl: string,
    data: FeedData,
    cachedAt?: string
  ): Promise<void> {
    const db = await getDatabase();
    const effectiveCachedAt = cachedAt ?? new Date().toISOString();
    const dataJson = JSON.stringify(data);

    await db.runAsync(
      `INSERT OR REPLACE INTO feed_snapshots (refresh_id, feed_url, data, cached_at)
       VALUES (?, ?, ?, ?)`,
      [refreshId, feedUrl, dataJson, effectiveCachedAt]
    );
  }

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

  /**
   * Delete all snapshots for a refresh (CASCADE will handle this, but explicit for clarity)
   */
  async deleteForRefresh(refreshId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM feed_snapshots WHERE refresh_id = ?", [refreshId]);
  }

  /**
   * Get the latest snapshot for a feed URL across all refreshes
   * Used for failed feed fallback - get last good snapshot
   */
  async getLatestForFeed(
    feedUrl: string
  ): Promise<{ refreshId: string; data: FeedData; cachedAt: string } | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      refresh_id: string;
      data: string;
      cached_at: string;
    } | undefined>(
      `SELECT refresh_id, data, cached_at FROM feed_snapshots
       WHERE feed_url = ?
       ORDER BY cached_at DESC
       LIMIT 1`,
      [feedUrl]
    );

    if (!row) return null;

    try {
      const data = JSON.parse(row.data) as FeedData;
      return { refreshId: row.refresh_id, data, cachedAt: row.cached_at };
    } catch {
      return null;
    }
  }
}

export const feedSnapshotRepository = new FeedSnapshotRepository();
