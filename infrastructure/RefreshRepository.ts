import { getDatabase } from "./database";

export type RefreshState = "building" | "ready" | "applied" | "superseded";

export interface RefreshRow {
  id: string;
  state: RefreshState;
  createdAt: string;
  completedAt: string | null;
  appliedAt: string | null;
  supersededAt: string | null;
}

export interface RefreshFeedRow {
  refreshId: string;
  feedUrl: string;
  status: "success" | "failed";
  errorMessage: string | null;
  itemsCount: number | null;
  completedAt: string | null;
}

export class RefreshRepository {
  /**
   * Create a new refresh in 'building' state
   */
  async create(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO refreshes (id, state, created_at) VALUES (?, 'building', ?)`,
      [refreshId, now]
    );
  }

  /**
   * Get a refresh by ID
   */
  async get(refreshId: string): Promise<RefreshRow | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      state: string;
      created_at: string;
      completed_at: string | null;
      applied_at: string | null;
      superseded_at: string | null;
    } | undefined>(
      `SELECT id, state, created_at, completed_at, applied_at, superseded_at
       FROM refreshes WHERE id = ?`,
      [refreshId]
    );

    if (!row) return null;

    return {
      id: row.id,
      state: row.state as RefreshState,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      appliedAt: row.applied_at,
      supersededAt: row.superseded_at,
    };
  }

  /**
   * Mark a refresh as ready (completed, waiting to be applied)
   */
  async markReady(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE refreshes SET state = 'ready', completed_at = ? WHERE id = ?`,
      [now, refreshId]
    );
  }

  /**
   * Mark a refresh as applied
   */
  async markApplied(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE refreshes SET state = 'applied', applied_at = ? WHERE id = ?`,
      [now, refreshId]
    );
  }

  /**
   * Mark a refresh as superseded
   */
  async markSuperseded(refreshId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE refreshes SET state = 'superseded', superseded_at = ? WHERE id = ?`,
      [now, refreshId]
    );
  }

  /**
   * Record per-feed status for a refresh
   */
  async recordFeedStatus(
    refreshId: string,
    feedUrl: string,
    status: "success" | "failed",
    errorMessage: string | null,
    itemsCount: number | null
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO refresh_feeds
       (refresh_id, feed_url, status, error_message, items_count, completed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [refreshId, feedUrl, status, errorMessage, itemsCount, now]
    );
  }

  /**
   * Get all feed statuses for a refresh
   */
  async getFeedStatuses(refreshId: string): Promise<RefreshFeedRow[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      refresh_id: string;
      feed_url: string;
      status: string;
      error_message: string | null;
      items_count: number | null;
      completed_at: string | null;
    }>(
      `SELECT refresh_id, feed_url, status, error_message, items_count, completed_at
       FROM refresh_feeds WHERE refresh_id = ?`,
      [refreshId]
    );

    return rows.map((row) => ({
      refreshId: row.refresh_id,
      feedUrl: row.feed_url,
      status: row.status as "success" | "failed",
      errorMessage: row.error_message,
      itemsCount: row.items_count,
      completedAt: row.completed_at,
    }));
  }

  /**
   * Get all refreshes, ordered by creation time (newest first)
   */
  async getAll(): Promise<RefreshRow[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      state: string;
      created_at: string;
      completed_at: string | null;
      applied_at: string | null;
      superseded_at: string | null;
    }>(
      `SELECT id, state, created_at, completed_at, applied_at, superseded_at
       FROM refreshes ORDER BY created_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      state: row.state as RefreshState,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      appliedAt: row.applied_at,
      supersededAt: row.superseded_at,
    }));
  }

  /**
   * Delete a refresh and all its associated data (CASCADE)
   */
  async delete(refreshId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM refreshes WHERE id = ?", [refreshId]);
  }

  /**
   * Clear all refreshes and associated data (refresh_feeds, feed_snapshots via CASCADE)
   * Used by cache clearing operations.
   */
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM refreshes");
  }
}

export const refreshRepository = new RefreshRepository();
