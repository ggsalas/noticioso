import FeedRefreshModule, { toNativeFeedInput } from "@/modules/FeedRefreshModule";
import { feedService } from "./FeedService";
import {
  activeRefreshRepository,
  pendingRefreshRepository,
  lastFetchCompletionRepository,
  refreshRepository,
  feedSnapshotRepository,
  getDatabase,
} from "@/infrastructure";
import type { Feed, FeedData } from "~/types";

/**
 * FeedRefreshService orchestrates the feed refresh flow using the native module.
 *
 * Stage 2 behavior:
 * - Calls native module to fetch and parse feeds off the JS thread
 * - Native module persists to SQLite (feed_snapshots, refresh_feeds, refreshes)
 * - JS reads from active refresh's feed_snapshots via feedSnapshotRepository
 * - Toast shows when READY pending refresh exists
 * - Toast tap applies by switching active_refresh_id
 * - applied_at timestamp comes from active_refresh table
 */
export class FeedRefreshService {
  /**
   * Trigger a native refresh of all configured feeds.
   * Returns a summary string from the native module.
   */
  async refreshAllFeeds(): Promise<string> {
    const feeds = await feedService.getFeeds();
    if (!feeds || feeds.length === 0) {
      return "No feeds configured";
    }

    const nativeFeeds = feeds.map(toNativeFeedInput);
    const result = await FeedRefreshModule.refreshFeeds(nativeFeeds);

    return result;
  }

  /**
   * Check if a READY pending refresh exists (for showing toast)
   */
  async hasPendingRefresh(): Promise<boolean> {
    const pending = await pendingRefreshRepository.get();
    return pending !== null;
  }

  /**
   * Apply the pending refresh by switching active_refresh pointer.
   * This is called when the user taps the toast.
   *
   * All operations are performed in a single transaction to ensure atomicity.
   * The applied_at timestamp is set automatically by activeRefreshRepository.set()
   */
  async applyPendingRefresh(): Promise<boolean> {
    const db = await getDatabase();
    let result = false;

    await db.withTransactionAsync(async () => {
      // Verify pending exists and is in READY state
      const pending = await pendingRefreshRepository.get();
      if (!pending) {
        return;
      }

      const pendingRefresh = await refreshRepository.get(pending.refreshId);
      if (!pendingRefresh || pendingRefresh.state !== 'ready') {
        return;
      }

      // Mark old active as superseded (if exists)
      const oldActive = await activeRefreshRepository.get();
      if (oldActive) {
        await refreshRepository.markSuperseded(oldActive.refreshId);
      }

      // Swap active pointer - this also sets applied_at timestamp
      await activeRefreshRepository.set(pending.refreshId);

      // Mark new refresh as applied
      await refreshRepository.markApplied(pending.refreshId);

      // Clear pending
      await pendingRefreshRepository.clear();

      result = true;
    });

    return result;
  }

  /**
   * Check if feeds are stale and should be refreshed.
   * Stale threshold: 1 hour.
   */
  async shouldRefresh(): Promise<boolean> {
    // Don't refresh if pending exists
    const hasPending = await this.hasPendingRefresh();
    if (hasPending) {
      return false;
    }

    // Check last fetch completion
    const lastFetch = await lastFetchCompletionRepository.get();
    if (!lastFetch) {
      return true; // Never fetched
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const lastFetchTime = new Date(lastFetch).getTime();

    return lastFetchTime < oneHourAgo;
  }

  /**
   * Get the last fetch completion timestamp
   */
  async getLastFetchCompletion(): Promise<string | null> {
    return lastFetchCompletionRepository.get();
  }

  /**
   * Get feed data from the active refresh (reads from feed_snapshots)
   */
  async getFeedData(feedUrl: string): Promise<FeedData | null> {
    const active = await activeRefreshRepository.get();
    if (!active) {
      return null;
    }

    const snapshot = await feedSnapshotRepository.get(active.refreshId, feedUrl);
    return snapshot?.data ?? null;
  }
}

export const feedRefreshService = new FeedRefreshService();
