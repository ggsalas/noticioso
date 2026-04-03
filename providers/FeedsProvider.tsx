import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAsyncFn } from "../hooks/useAsyncFn";
import { feedService } from "@/services/FeedService";
import { feedCacheService } from "@/services/FeedCacheService";
import { batchPromises } from "@/lib/batchPromises";
import { Feed, FeedData } from "@/types";

const PREFETCH_BATCH_SIZE = 5;
const FORCE_REFRESH_TIME = 60 * 60 * 1000; // 1 hour

type FeedsProviderProps = { children: ReactNode };

type FeedsContextType = {
  loading?: boolean;
  error?: string | null;
  feeds?: Feed[] | null;
  feedArticleCounts: Record<string, number>;
  prefetching: boolean;
  lastFullRefreshAt: string | null;
  getFeeds: () => void;
  importFeeds: (feeds: string) => Promise<boolean | undefined>;
  updateFeeds: (feeds: Feed[]) => Promise<boolean | undefined>;
  addOrEditFeed: (feed: Feed) => Promise<boolean | undefined>;
  deleteFeed: (feed: Feed) => Promise<boolean | undefined>;
  refreshAllFeeds: () => Promise<void>;
};

const FeedsContext = createContext<FeedsContextType>({
  feedArticleCounts: {},
  prefetching: false,
  lastFullRefreshAt: null,
  getFeeds: () => null,
  importFeeds: async (_feeds: string) => true,
  updateFeeds: async (_feeds: Feed[]) => true,
  addOrEditFeed: async (_feed: Feed) => true,
  deleteFeed: async (_feed: Feed) => true,
  refreshAllFeeds: async () => {},
});

export function FeedsProvider({ children }: FeedsProviderProps) {
  const {
    data,
    loading,
    error,
    runFn: refetchFeeds,
  } = useAsyncFn(feedService.getFeeds, undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedArticleCounts, setFeedArticleCounts] = useState<
    Record<string, number>
  >({});
  const [prefetching, setPrefetching] = useState(false);
  const [lastFullRefreshAt, setLastFullRefreshAt] = useState<string | null>(
    null,
  );

  // Fetch feed counts from network and optionally merge with existing counts
  const fetchFeedCounts = async (
    feeds: Feed[],
    existingCounts?: Record<string, number>,
  ): Promise<{ counts: Record<string, number>; anySuccess: boolean }> => {
    const counts: Record<string, number> = existingCounts
      ? { ...existingCounts }
      : {};

    const results = await batchPromises<
      { data: FeedData; fromCache: boolean } | undefined
    >(
      feeds.map(
        (feed) => () => feedService.getFeedContent(feed.url, undefined, true),
      ),
      PREFETCH_BATCH_SIZE,
    );

    let anySuccess = false;
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        counts[feeds[i].url] =
          result.value?.data.rss?.channel?.item?.length ?? 0;
        anySuccess = true;
      }
    });

    return { counts, anySuccess };
  };

  const refreshAllFeeds = useCallback(async () => {
    const feeds = data;
    if (!feeds || feeds.length === 0) return;

    setPrefetching(true);
    try {
      const { counts, anySuccess } = await fetchFeedCounts(
        feeds,
        feedArticleCounts,
      );
      setFeedArticleCounts(counts);

      if (anySuccess) {
        const now = new Date().toISOString();
        await feedCacheService.setLastFullRefresh(now);
        setLastFullRefreshAt(now);
      }
    } finally {
      setPrefetching(false);
    }
  }, [data, feedArticleCounts]);

  // On mount: load cached counts, then decide whether to refresh from network
  useEffect(() => {
    if (!data || data.length === 0) return;

    const initCounts = async () => {
      // Load counts from existing cache entries
      const counts: Record<string, number> = {};
      await Promise.allSettled(
        data.map(async (feed) => {
          const cached = await feedCacheService.get(feed.url);
          if (cached) {
            counts[feed.url] = cached.data.rss?.channel?.item?.length ?? 0;
          }
        }),
      );
      setFeedArticleCounts(counts);

      // Check if we need a network refresh
      const lastRefresh = await feedCacheService.getLastFullRefresh();
      setLastFullRefreshAt(lastRefresh);

      const needsRefresh =
        lastRefresh === null ||
        new Date().getTime() - new Date(lastRefresh).getTime() >
          FORCE_REFRESH_TIME;

      if (needsRefresh) {
        setPrefetching(true);
        try {
          const { counts: newCounts, anySuccess } = await fetchFeedCounts(data);
          setFeedArticleCounts(newCounts);

          if (anySuccess) {
            const now = new Date().toISOString();
            await feedCacheService.setLastFullRefresh(now);
            setLastFullRefreshAt(now);
          }
        } finally {
          setPrefetching(false);
        }
      }
    };

    initCounts();
  }, [data]);

  const handleImportFeeds = async (feeds: string) => {
    try {
      const success = await feedService.importFeeds(feeds);
      setActionError(null);

      if (success) {
        refetchFeeds();
        return true;
      }
    } catch (e) {
      setActionError(`Cannot import feeds ${(e as Error).message}`);
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
        loading,
        error: error || actionError,
        feedArticleCounts,
        prefetching,
        lastFullRefreshAt,
        getFeeds: refetchFeeds,
        importFeeds: handleImportFeeds,
        updateFeeds: handleUpdateFeeds,
        addOrEditFeed: handleAddOrEditFeed,
        deleteFeed: handleDeleteFeed,
        refreshAllFeeds,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeedsContext() {
  return useContext(FeedsContext);
}
