import FeedRefreshModule, { toNativeFeedInput } from "@/modules/FeedRefreshModule";
import { feedService } from "./FeedService";
import { refreshRepository } from "@/db";

/**
 * Drives the native feed pipeline from JS: trigger a refresh, apply the pending
 * generation, decide when feeds are stale. All writes happen in the native module.
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
    const pending = await refreshRepository.getPending();
    return pending !== null;
  }

  /**
   * Apply the pending refresh (toast tap): native makes the READY pending
   * generation the active one in a single transaction, then garbage-collects the
   * generation it replaced. Resolves true if a generation was applied.
   */
  async applyPendingRefresh(): Promise<boolean> {
    return FeedRefreshModule.applyPendingRefresh();
  }

  /**
   * Check if feeds are stale and should be refreshed.
   * Stale threshold: 1 hour since the last completed feed pass.
   *
   * An unapplied pending generation does NOT block a refresh: old news is useless,
   * so a new pass replaces it (native marks the previous pending as superseded).
   */
  async shouldRefresh(): Promise<boolean> {
    // Check last fetch completion
    const lastFetch = await refreshRepository.getLastFetchCompletion();
    if (!lastFetch) {
      return true; // Never fetched
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const lastFetchTime = new Date(lastFetch).getTime();

    return lastFetchTime < oneHourAgo;
  }
}

export const feedRefreshService = new FeedRefreshService();
