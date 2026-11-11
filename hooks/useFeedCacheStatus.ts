import { useCallback, useState } from "react";
import { feedContentService } from "@/services/FeedContentService";
import type { Feed } from "@/types";

/**
 * Per-feed numbers shown in the feed list, derived from the ACTIVE generation:
 * article counts and the "all articles cached" indicator. Nothing is persisted;
 * callers reload when the generation or the cache changes.
 */
export function useFeedCacheStatus() {
  const [feedArticleCounts, setFeedArticleCounts] = useState<Record<string, number>>({});
  const [feedArticleCacheComplete, setFeedArticleCacheComplete] = useState<
    Record<string, boolean>
  >({});

  const reloadCounts = useCallback(async (feeds: Feed[]) => {
    setFeedArticleCounts(await feedContentService.getArticleCounts(feeds.map((f) => f.url)));
  }, []);

  const reloadCompleteness = useCallback(async (feeds: Feed[]) => {
    setFeedArticleCacheComplete(
      await feedContentService.getCacheCompleteness(feeds.map((f) => f.url)),
    );
  }, []);

  // Recompute a single feed (after its native per-feed download event) instead of
  // rescanning every snapshot.
  const reloadFeedCompleteness = useCallback(async (feedUrl: string) => {
    try {
      const isComplete = await feedContentService.isFeedFullyCached(feedUrl);
      setFeedArticleCacheComplete((previous) => ({ ...previous, [feedUrl]: isComplete }));
    } catch (error) {
      // Advisory indicator: a failed check must not disrupt reading
      console.warn(`Could not recalculate article cache status for ${feedUrl}:`, error);
    }
  }, []);

  const clear = useCallback(() => {
    setFeedArticleCounts({});
    setFeedArticleCacheComplete({});
  }, []);

  return {
    feedArticleCounts,
    feedArticleCacheComplete,
    reloadCounts,
    reloadCompleteness,
    reloadFeedCompleteness,
    clear,
  };
}
