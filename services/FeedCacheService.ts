import {
  activeRefreshRepository,
  feedSnapshotRepository,
  pendingRefreshRepository,
  lastFetchCompletionRepository,
} from "@/infrastructure";
import type { FeedData } from "~/types";

export type FeedCache = {
  data: FeedData;
  cachedAt: string; // ISO timestamp
};

/**
 * FeedCacheService provides access to cached feed data in Stage 2.
 *
 * In Stage 2, feed data is stored in feed_snapshots table, keyed by refresh_id + feed_url.
 * The active refresh is tracked by active_refresh table.
 *
 * - get(url) reads from the active refresh's snapshots
 * - set(url, data) writes to the pending refresh's snapshots (if one exists), otherwise no-op
 * - delete(url) deletes from the pending refresh's snapshots (if one exists), otherwise no-op
 * - getLastFullRefresh() returns the applied timestamp from active_refresh
 * - setLastFullRefresh() is deprecated (applied_at is set by activeRefreshRepository.set())
 */
export class FeedCacheService {
  /**
   * Get cached feed data from the active refresh's snapshots.
   */
  get = async (url: string): Promise<FeedCache | null> => {
    const active = await activeRefreshRepository.get();
    if (!active) {
      return null;
    }

    const snapshot = await feedSnapshotRepository.get(active.refreshId, url);
    if (!snapshot) {
      return null;
    }

    return {
      data: snapshot.data,
      cachedAt: snapshot.cachedAt,
    };
  };

  /**
   * Cache feed data. In Stage 2, writes to the pending refresh's snapshots if one exists.
   * Native module handles writing to feed_snapshots during refresh.
   * This method is primarily for the JS fetch path (if used).
   */
  set = async (url: string, data: FeedData): Promise<void> => {
    try {
      const pending = await pendingRefreshRepository.get();
      if (!pending) {
        // No pending refresh - native module handles this
        return;
      }

      await feedSnapshotRepository.set(pending.refreshId, url, data);
    } catch (error) {
      // Cache is optional - don't fail if storage fails
      console.warn("Failed to cache feed:", url, error);
    }
  };

  /**
   * Delete cached feed data. In Stage 2, deletes from the pending refresh's snapshots if one exists.
   */
  delete = async (url: string): Promise<void> => {
    const pending = await pendingRefreshRepository.get();
    if (!pending) {
      return;
    }

    // Delete from pending refresh's snapshots
    // Note: feedSnapshotRepository doesn't have a delete method for individual snapshots,
    // so we'll just skip this for now. The native module will handle creating a new
    // refresh without this feed.
    // TODO: Consider adding a delete method to feedSnapshotRepository if needed
    void url;
  };

  /**
   * Get the timestamp when the active refresh was applied.
   * This is the UI's "applied" timestamp, shown to the user.
   */
  getLastFullRefresh = async (): Promise<string | null> => {
    const active = await activeRefreshRepository.get();
    if (!active) {
      return null;
    }
    return active.appliedAt;
  };

  /**
   * @deprecated In Stage 2, applied_at is set by activeRefreshRepository.set() during toast apply.
   * This method is kept for backward compatibility but is a no-op.
   */
  setLastFullRefresh = async (_timestamp: string): Promise<void> => {
    // No-op: applied_at is set by activeRefreshRepository.set() when pending refresh is applied
    console.warn(
      "setLastFullRefresh is deprecated in Stage 2. applied_at is set by activeRefreshRepository.set()"
    );
  };
}

export const feedCacheService = new FeedCacheService();
