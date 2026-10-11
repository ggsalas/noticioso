import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { feedService } from "@/services/FeedService";
import { feedRefreshService } from "@/services/FeedRefreshService";
import { feedCacheService } from "@/services/FeedCacheService";
import { articleCacheService } from "@/services/ArticleCacheService";
import { activeRefreshRepository, feedSnapshotRepository } from "@/infrastructure";
import { Feed } from "@/types";
import { useAsyncFn } from "@/hooks/useAsyncFn";
import {
  onArticleDownloadFeedStarted,
  onArticleDownloadFeedComplete
} from "@/infrastructure/ArticleDownloadEventSubscriber";

type FeedsProviderProps = { children: ReactNode };

type ProgressStatus = {
  name: "FETCHING";
  current: number;
  total: number;
};

export type ArticleDownloadProgress = {
  refreshId: string;
  status: "fetching" | "complete";
  feedIndex: number;
  feedCount: number;
  articleCount: number;
  articleSuccessCount: number;
  articleFailedCount: number;
};

type FeedsUpdatingState = ProgressStatus | null;

type FeedsContextType = {
  loading?: FeedsUpdatingState;
  updating?: FeedsUpdatingState;
  error?: string | null;
  feeds?: Feed[] | null;
  feedArticleCounts: Record<string, number>;
  feedArticleCacheComplete: Record<string, boolean>;
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
  feedArticleCacheComplete: {},
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
  const [feedArticleCounts, setFeedArticleCounts] = useState<
    Record<string, number>
  >({});
  const [feedArticleCacheComplete, setFeedArticleCacheComplete] = useState<
    Record<string, boolean>
  >({});
  const [updating, setUpdating] = useState<FeedsUpdatingState>(null);
  const [lastFullRefreshAt, setLastFullRefreshAt] = useState<string | null>(
    null,
  );
  const [shouldShowUpdateToast, setShouldShowUpdateToast] = useState(false);
  const [articleDownloadProgress, setArticleDownloadProgress] = useState<ArticleDownloadProgress | null>(null);
  const previousFeedUrlsRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef(AppState.currentState);

  // Load feed article counts from active refresh
  const loadCachedCounts = useCallback(async (feeds: Feed[]) => {
    const counts: Record<string, number> = {};

    await Promise.allSettled(
      feeds.map(async (feed) => {
        const cached = await feedCacheService.get(feed.url);
        if (cached) {
          counts[feed.url] = cached.data.rss?.channel?.item?.length ?? 0;
        }
      }),
    );

    setFeedArticleCounts(counts);
    return counts;
  }, []);

  // Compute cache completeness for feeds based on active snapshot
  const computeFeedCacheCompleteness = useCallback(async (feeds: Feed[]): Promise<Record<string, boolean>> => {
    const completeness: Record<string, boolean> = {};

    // Get active refresh ID
    const activeRefresh = await activeRefreshRepository.get();
    if (!activeRefresh) {
      setFeedArticleCacheComplete({});
      return completeness;
    }

    // Get all snapshots for the active refresh
    const snapshots = await feedSnapshotRepository.getAllForRefresh(activeRefresh.refreshId);

    // Build a map of feed URL to snapshot data
    const snapshotMap = new Map<string, typeof snapshots[0]>();
    for (const snapshot of snapshots) {
      snapshotMap.set(snapshot.feedUrl, snapshot);
    }

    // For each feed, check if all article URLs are cached
    await Promise.allSettled(
      feeds.map(async (feed) => {
        const snapshot = snapshotMap.get(feed.url);
        if (!snapshot) {
          completeness[feed.url] = false;
          return;
        }

        // Extract article URLs from snapshot
        const items = snapshot.data.rss?.channel?.item ?? [];
        const urls = items
          .map(item => item.link)
          .filter(link => link && link.trim() !== "");

        // If snapshot has zero article URLs, show no icon (don't set completeness)
        if (urls.length === 0) {
          return;
        }

        // Check if all URLs are fully cached (metadata + file)
        const cachedUrls = await articleCacheService.getFullyCachedUrls(urls);
        const cachedUrlSet = new Set(cachedUrls);

        // Feed is complete only if it has >=1 article and every URL is cached
        completeness[feed.url] = urls.length > 0 && urls.every(url => cachedUrlSet.has(url));
      }),
    );

    setFeedArticleCacheComplete(completeness);
    return completeness;
  }, []);

  // Recompute only the feed reported by the native completion event. The active
  // snapshot remains the source for membership; metadata/files are global by URL.
  const refreshFeedCacheCompleteness = useCallback(async (feedUrl: string) => {
    try {
      const activeRefresh = await activeRefreshRepository.get();
      const snapshot = activeRefresh
        ? await feedSnapshotRepository.get(activeRefresh.refreshId, feedUrl)
        : null;
      const urls = (snapshot?.data.rss?.channel?.item ?? [])
        .map((item) => item.link)
        .filter((url) => url && url.trim().length > 0);

      const fullyCachedUrls = urls.length > 0
        ? new Set(await articleCacheService.getFullyCachedUrls(urls))
        : new Set<string>();
      const isComplete = urls.length > 0 && urls.every((url) => fullyCachedUrls.has(url));

      setFeedArticleCacheComplete((previous) => ({
        ...previous,
        [feedUrl]: isComplete,
      }));
    } catch (error) {
      // This is an advisory indicator; cache/query failures should not disrupt reading.
      console.warn(`Could not recalculate article cache status for ${feedUrl}:`, error);
    }
  }, []);

  // Check if toast should be shown (READY pending refresh exists)
  const checkShouldShowToast = useCallback(async () => {
    const hasPending = await feedRefreshService.hasPendingRefresh();
    return hasPending;
  }, []);

  // Subscribe to article download progress events
  useEffect(() => {
    const startedSubscription = onArticleDownloadFeedStarted((event) => {
      // Start event: set status to 'fetching' with initial counts
      setArticleDownloadProgress({
        refreshId: event.refreshId,
        status: "fetching",
        feedIndex: 0,
        feedCount: event.feedCount,
        articleCount: event.articleCount,
        articleSuccessCount: 0,
        articleFailedCount: 0,
      });
    });

    const completeSubscription = onArticleDownloadFeedComplete((event) => {
      // Complete event: update progress and mark as 'complete' if this is the last feed
      setArticleDownloadProgress((prev) => {
        const isLastFeed = event.feedIndex === event.feedCount;
        return {
          refreshId: event.refreshId,
          status: isLastFeed ? "complete" : "fetching",
          feedIndex: event.feedIndex,
          feedCount: event.feedCount,
          articleCount: event.articleCount,
          articleSuccessCount: event.articleSuccessCount,
          articleFailedCount: event.articleFailedCount,
        };
      });

      // Recompute only this feed; avoid rescanning every active snapshot per event.
      refreshFeedCacheCompleteness(event.feedUrl);
    });

    return () => {
      startedSubscription.remove();
      completeSubscription.remove();
    };
  }, [refreshFeedCacheCompleteness]);

  // Load initial data and check for pending refresh
  useEffect(() => {
    if (!data || data.length === 0) return;

    const initData = async () => {
      const currentUrls = new Set(data.map((f) => f.url));

      // Load counts from active refresh
      const counts = await loadCachedCounts(data);

      // Compute cache completeness
      await computeFeedCacheCompleteness(data);

      // Load the applied/active refresh timestamp for the header
      // (applied_at is set transactionally when a pending refresh is applied
      // on toast tap, never by the native fetch)
      const appliedAt = await feedCacheService.getLastFullRefresh();
      setLastFullRefreshAt(appliedAt);

      // Check if toast should be shown
      const shouldToast = await checkShouldShowToast();
      setShouldShowUpdateToast(shouldToast);

      // Save current URLs for next comparison
      previousFeedUrlsRef.current = currentUrls;
    };

    initData();
  }, [data, loadCachedCounts, computeFeedCacheCompleteness, checkShouldShowToast]);

  // Refresh all feeds using native module (Stage 2 flow)
  // Does NOT update counts or timestamps - those are updated only when toast is tapped
  const refreshAllFeeds = useCallback(async () => {
    const feeds = data;
    if (!feeds || feeds.length === 0) return;

    // Don't start a feed pass while the native article worker owns the worker slot.
    if (updating || articleDownloadProgress?.status === "fetching") return;

    setUpdating({ name: "FETCHING", current: 0, total: feeds.length });
    try {
      // Call native module to fetch and parse feeds
      await feedRefreshService.refreshAllFeeds();

      // DO NOT update counts or timestamps yet - they come from active refresh
      // Only update them when toast is tapped (apply pending)

      // Check if READY pending exists and show toast
      const hasPending = await feedRefreshService.hasPendingRefresh();
      if (hasPending) {
        setShouldShowUpdateToast(true);
      }

      previousFeedUrlsRef.current = new Set(feeds.map((f) => f.url));
    } catch (e) {
      console.error("Failed to refresh feeds:", e);
      setActionError("Failed to refresh feeds");
    } finally {
      setUpdating(null);
    }
  }, [data, updating, articleDownloadProgress]);

  // On initial mount, auto-trigger refresh if stale and no pending
  const initialMountRef = useRef(true);
  useEffect(() => {
    if (!data || data.length === 0 || !initialMountRef.current) return;

    initialMountRef.current = false;

    const checkAndRefresh = async () => {
      const shouldToast = await checkShouldShowToast();
      if (!shouldToast) {
        const shouldRefresh = await feedRefreshService.shouldRefresh();
        if (shouldRefresh) {
          await refreshAllFeeds();
        }
      }
    };

    checkAndRefresh();
  }, [data, checkShouldShowToast, refreshAllFeeds]);

  // Trigger refresh on foreground when no READY pending and last fetch > 1 hour
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App came to foreground
        // First check if there's already a pending refresh
        const shouldToast = await feedRefreshService.hasPendingRefresh();
        if (shouldToast) {
          setShouldShowUpdateToast(true);
          return;
        }

        // No pending, check if we should refresh
        const shouldRefresh = await feedRefreshService.shouldRefresh();
        if (shouldRefresh) {
          await refreshAllFeeds();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [refreshAllFeeds]);

  const dismissToast = useCallback(() => {
    setShouldShowUpdateToast(false);
  }, []);

  const clearFeedArticleCounts = useCallback(() => {
    setFeedArticleCounts({});
    setFeedArticleCacheComplete({});
  }, []);

  // Refresh cache completeness state (called on focus/return)
  const refreshActiveFeedCacheState = useCallback(async () => {
    if (data && data.length > 0) {
      await computeFeedCacheCompleteness(data);
    }
  }, [data, computeFeedCacheCompleteness]);

  // Apply pending refresh (toast tap handler)
  const refreshAndUpdateToast = useCallback(async () => {
    const applied = await feedRefreshService.applyPendingRefresh();
    if (applied) {
      setShouldShowUpdateToast(false);
      // Reload feeds to show new active refresh data
      await refetchFeeds();
      const counts = await loadCachedCounts(data || []);
      setFeedArticleCounts(counts);
      // Reload the applied timestamp (updated transactionally during apply)
      const appliedAt = await feedCacheService.getLastFullRefresh();
      setLastFullRefreshAt(appliedAt);
    }
  }, [refetchFeeds, data, loadCachedCounts]);

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
        feedArticleCounts,
        feedArticleCacheComplete,
        updating,
        lastFullRefreshAt,
        shouldShowUpdateToast,
        articleDownloadProgress,
        getFeeds: refetchFeeds,
        importFeeds: handleImportFeeds,
        updateFeeds: handleUpdateFeeds,
        addOrEditFeed: handleAddOrEditFeed,
        deleteFeed: handleDeleteFeed,
        refreshAllFeeds,
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
