import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { feedService } from "@/services/FeedService";
import { feedRefreshService } from "@/services/FeedRefreshService";
import { feedContentService } from "@/services/FeedContentService";
import { Feed } from "@/types";
import { useAsyncFn } from "@/hooks/useAsyncFn";
import { useFeedCacheStatus } from "@/hooks/useFeedCacheStatus";
import {
  useRefreshLifecycle,
  type ArticleDownloadProgress,
  type FeedsUpdatingState,
} from "@/hooks/useRefreshLifecycle";

export type { ArticleDownloadProgress } from "@/hooks/useRefreshLifecycle";

type FeedsProviderProps = { children: ReactNode };

type FeedsContextType = {
  loading?: FeedsUpdatingState;
  updating?: FeedsUpdatingState;
  error?: string | null;
  feeds?: Feed[] | null;
  feedArticleCounts: Record<string, number>;
  feedDownloadsAttempted: Record<string, boolean>;
  lastFullRefreshAt: string | null;
  shouldShowUpdateToast: boolean;
  articleDownloadProgress: ArticleDownloadProgress | null;
  getFeeds: () => void;
  importFeeds: (feeds: string) => Promise<boolean | undefined>;
  updateFeeds: (feeds: Feed[]) => Promise<boolean | undefined>;
  addOrEditFeed: (feed: Feed) => Promise<boolean | undefined>;
  deleteFeed: (feed: Feed) => Promise<boolean | undefined>;
  refreshAllFeeds: () => Promise<void>;
  dismissToast: () => void;
  refreshAndUpdateToast: () => Promise<void>;
  clearFeedArticleCounts: () => void;
  refreshActiveFeedCacheState: () => Promise<void>;
};

const FeedsContext = createContext<FeedsContextType>({
  feedArticleCounts: {},
  feedDownloadsAttempted: {},
  lastFullRefreshAt: null,
  shouldShowUpdateToast: false,
  articleDownloadProgress: null,
  getFeeds: () => null,
  importFeeds: async (_feeds: string) => true,
  updateFeeds: async (_feeds: Feed[]) => true,
  addOrEditFeed: async (_feed: Feed) => true,
  deleteFeed: async (_feed: Feed) => true,
  refreshAllFeeds: async () => {},
  dismissToast: () => {},
  refreshAndUpdateToast: async () => {},
  clearFeedArticleCounts: () => {},
  refreshActiveFeedCacheState: async () => {},
});

export function FeedsProvider({ children }: FeedsProviderProps) {
  const {
    data,
    loading,
    error,
    runFn: refetchFeeds,
  } = useAsyncFn(feedService.getFeeds, undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastFullRefreshAt, setLastFullRefreshAt] = useState<string | null>(null);

  const cacheStatus = useFeedCacheStatus();
  const { reloadCounts, reloadDownloadsAttempted, clear: clearCacheStatus } = cacheStatus;

  const refresh = useRefreshLifecycle({
    feeds: data,
    onFeedArticlesDownloaded: cacheStatus.reloadFeedDownloadsAttempted,
    onError: setActionError,
  });
  const { syncToast, dismissToast, reset: resetRefresh } = refresh;

  // Everything derived from the active generation, (re)loaded when the feed list changes
  useEffect(() => {
    if (!data || data.length === 0) return;

    const loadGenerationState = async () => {
      await reloadCounts(data);
      await reloadDownloadsAttempted(data);
      // applied_at changes only when a pending generation is applied (toast tap)
      setLastFullRefreshAt(await feedContentService.getLastFullRefresh());
      await syncToast();
    };

    loadGenerationState();
  }, [data, reloadCounts, reloadDownloadsAttempted, syncToast]);

  // Called after "Clear cache": no generation exists anymore, so every piece of
  // state derived from generations must go (counts, indicators, toast, timestamp).
  const clearFeedArticleCounts = useCallback(() => {
    clearCacheStatus();
    resetRefresh();
    setLastFullRefreshAt(null);
  }, [clearCacheStatus, resetRefresh]);

  // Recompute the cache indicators (called when the feed list screen gets focus)
  const refreshActiveFeedCacheState = useCallback(async () => {
    if (data && data.length > 0) {
      await reloadDownloadsAttempted(data);
    }
  }, [data, reloadDownloadsAttempted]);

  // Apply the pending generation (toast tap)
  const refreshAndUpdateToast = useCallback(async () => {
    const applied = await feedRefreshService.applyPendingRefresh();
    // Applied, or there was nothing to apply (stale toast): hide it either way
    dismissToast();
    if (applied) {
      await refetchFeeds();
      await reloadCounts(data || []);
      // New generation: its downloads may not have started yet, so the ● must
      // be recomputed (it would otherwise keep the previous generation's).
      await reloadDownloadsAttempted(data || []);
      setLastFullRefreshAt(await feedContentService.getLastFullRefresh());
    }
  }, [refetchFeeds, data, reloadCounts, reloadDownloadsAttempted, dismissToast]);

  const handleImportFeeds = async (feeds: string) => {
    try {
      const success = await feedService.importFeeds(feeds);
      setActionError(null);

      if (success) {
        refetchFeeds();
        return true;
      }
    } catch (e) {
      const message = (e as Error).message;
      setActionError(`Cannot import feeds ${message}`);
    }
  };

  const handleUpdateFeeds = async (feeds: Feed[]) => {
    try {
      const success = await feedService.saveFeeds(feeds);
      setActionError(null);

      if (success) {
        await refetchFeeds();
        return true;
      }
    } catch (e) {
      setActionError(`Cannot save feeds ${(e as Error).message}`);
    }
  };

  const handleAddOrEditFeed = async (feed: Feed) => {
    try {
      const success = await feedService.createOrEditFeed(feed);
      setActionError(null);

      if (success) {
        await refetchFeeds();
        return true;
      }
    } catch (e) {
      setActionError(`Cannot add feed ${(e as Error).message}`);
    }
  };

  const handleDeleteFeed = async (feed: Feed) => {
    try {
      const success = await feedService.deleteFeed(feed);
      setActionError(null);

      if (success) {
        await refetchFeeds();
        return true;
      }
    } catch (e) {
      setActionError(`Cannot delete the feed ${(e as Error).message}`);
    }
  };

  return (
    <FeedsContext.Provider
      value={{
        feeds: data,
        loading: loading ? { name: "FETCHING", current: 0, total: 0 } : null,
        error: error ?? actionError,
        feedArticleCounts: cacheStatus.feedArticleCounts,
        feedDownloadsAttempted: cacheStatus.feedDownloadsAttempted,
        updating: refresh.updating,
        lastFullRefreshAt,
        shouldShowUpdateToast: refresh.shouldShowUpdateToast,
        articleDownloadProgress: refresh.articleDownloadProgress,
        getFeeds: refetchFeeds,
        importFeeds: handleImportFeeds,
        updateFeeds: handleUpdateFeeds,
        addOrEditFeed: handleAddOrEditFeed,
        deleteFeed: handleDeleteFeed,
        refreshAllFeeds: refresh.refreshAllFeeds,
        dismissToast,
        refreshAndUpdateToast,
        clearFeedArticleCounts,
        refreshActiveFeedCacheState,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeedsContext() {
  return useContext(FeedsContext);
}
