import { useCallback, useState } from "react";
import { feedContentService } from "@/services/FeedContentService";
import type { Feed } from "@/types";

/**
 * Per-feed numbers shown in the feed list, derived from the ACTIVE generation:
 * article counts and the ● "downloads attempted" indicator. Nothing is persisted;
 * callers reload when the generation or the cache changes.
 */
export function useFeedCacheStatus() {
  const [feedArticleCounts, setFeedArticleCounts] = useState<Record<string, number>>({});
  const [feedDownloadsAttempted, setFeedDownloadsAttempted] = useState<
    Record<string, boolean>
  >({});

  const reloadCounts = useCallback(async (feeds: Feed[]) => {
    setFeedArticleCounts(await feedContentService.getArticleCounts(feeds.map((f) => f.url)));
  }, []);

  const reloadDownloadsAttempted = useCallback(async (feeds: Feed[]) => {
    setFeedDownloadsAttempted(
      await feedContentService.getDownloadsAttempted(feeds.map((f) => f.url)),
    );
  }, []);

  // Recompute a single feed (after its native per-feed download event) instead of
  // rescanning every snapshot.
  const reloadFeedDownloadsAttempted = useCallback(async (feedUrl: string) => {
    try {
      const attempted = await feedContentService.isFeedDownloadAttempted(feedUrl);
      setFeedDownloadsAttempted((previous) => ({ ...previous, [feedUrl]: attempted }));
    } catch (error) {
      // Advisory indicator: a failed check must not disrupt reading
      console.warn(`Could not recalculate article cache status for ${feedUrl}:`, error);
    }
  }, []);

  const clear = useCallback(() => {
    setFeedArticleCounts({});
    setFeedDownloadsAttempted({});
  }, []);

  return {
    feedArticleCounts,
    feedDownloadsAttempted,
    reloadCounts,
    reloadDownloadsAttempted,
    reloadFeedDownloadsAttempted,
    clear,
  };
}
