import { useCallback, useState } from "react";
import { feedContentService } from "@/services/FeedContentService";
import type { Feed, FeedDownloadStatus } from "@/types";

/**
 * Per-feed numbers shown in the feed list, derived from the ACTIVE generation:
 * article counts and the download indicator (● / ○). Nothing is persisted;
 * callers reload when the generation or the cache changes.
 */
export function useFeedCacheStatus() {
  const [feedArticleCounts, setFeedArticleCounts] = useState<Record<string, number>>({});
  const [feedDownloadStatus, setFeedDownloadStatus] = useState<
    Record<string, FeedDownloadStatus>
  >({});

  const reloadCounts = useCallback(async (feeds: Feed[]) => {
    setFeedArticleCounts(await feedContentService.getArticleCounts(feeds.map((f) => f.url)));
  }, []);

  const reloadDownloadStatus = useCallback(async (feeds: Feed[]) => {
    setFeedDownloadStatus(
      await feedContentService.getDownloadStatuses(feeds.map((f) => f.url)),
    );
  }, []);

  // Recompute a single feed (after its native per-feed download event) instead of
  // rescanning every snapshot.
  const reloadFeedDownloadStatus = useCallback(async (feedUrl: string) => {
    try {
      const status = await feedContentService.getFeedDownloadStatus(feedUrl);
      setFeedDownloadStatus((previous) => ({ ...previous, [feedUrl]: status }));
    } catch (error) {
      // Advisory indicator: a failed check must not disrupt reading
      console.warn(`Could not recalculate article cache status for ${feedUrl}:`, error);
    }
  }, []);

  const clear = useCallback(() => {
    setFeedArticleCounts({});
    setFeedDownloadStatus({});
  }, []);

  return {
    feedArticleCounts,
    feedDownloadStatus,
    reloadCounts,
    reloadDownloadStatus,
    reloadFeedDownloadStatus,
    clear,
  };
}
