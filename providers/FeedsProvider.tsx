import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useAsyncFn } from "../hooks/useAsyncFn";
import { feedService } from "@/services/FeedService";
import { feedCacheService } from "@/services/FeedCacheService";
import { Feed } from "@/types";

const CACHE_STALE_TIME_MS = 3 * 60 * 60 * 1000;

type FeedsProviderProps = { children: ReactNode };

type ProgressStatus = {
  name: "FETCHING" | "PRELOADING";
  current: number;
  total: number;
};

type FeedsUpdatingState = ProgressStatus | null;

type FeedsContextType = {
  loading?: FeedsUpdatingState;
  updating?: FeedsUpdatingState;
  error?: string | null;
  feeds?: Feed[] | null;
  feedArticleCounts: Record<string, number>;
  lastFullRefreshAt: string | null;
  shouldShowUpdateToast: boolean;
  getFeeds: () => void;
  importFeeds: (feeds: string) => Promise<boolean | undefined>;
  updateFeeds: (feeds: Feed[]) => Promise<boolean | undefined>;
  addOrEditFeed: (feed: Feed) => Promise<boolean | undefined>;
  deleteFeed: (feed: Feed) => Promise<boolean | undefined>;
  refreshAllFeeds: () => Promise<void>;
  dismissToast: () => void;
  refreshAndUpdateToast: () => Promise<void>;
  clearFeedArticleCounts: () => void;
};

const FeedsContext = createContext<FeedsContextType>({
  feedArticleCounts: {},
  lastFullRefreshAt: null,
  shouldShowUpdateToast: false,
  getFeeds: () => null,
  importFeeds: async (_feeds: string) => true,
  updateFeeds: async (_feeds: Feed[]) => true,
  addOrEditFeed: async (_feed: Feed) => true,
  deleteFeed: async (_feed: Feed) => true,
  refreshAllFeeds: async () => {},
  dismissToast: () => {},
  refreshAndUpdateToast: async () => {},
  clearFeedArticleCounts: () => {},
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
  const [updating, setUpdating] = useState<FeedsUpdatingState>(null);
  const [lastFullRefreshAt, setLastFullRefreshAt] = useState<string | null>(
    null,
  );
  const [shouldShowUpdateToast, setShouldShowUpdateToast] = useState(false);
  const previousFeedUrlsRef = useRef<Set<string>>(new Set());

  // Cargar counts desde cache INMEDIATAMENTE (sin network)
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

  // Determinar si debe mostrar el toast
  const checkShouldShowToast = useCallback(
    async (
      feeds: Feed[],
      cachedCounts: Record<string, number>,
      previousUrls: Set<string>,
    ) => {
      if (!feeds || feeds.length === 0) return false;

      const lastRefresh = await feedCacheService.getLastFullRefresh();

      // Condition 1: cache is stale (passed minimum time)
      const staleThreshold = Date.now() - CACHE_STALE_TIME_MS;
      const isCacheStale =
        lastRefresh === null ||
        new Date(lastRefresh).getTime() < staleThreshold;

      // Condition 2: only new or removed feeds (NOT reordered)
      const currentUrls = new Set(feeds.map((f) => f.url));
      const newUrls = [...currentUrls].filter((url) => !previousUrls.has(url));
      const removedUrls = [...previousUrls].filter(
        (url) => !currentUrls.has(url),
      );
      const feedsChanged =
        previousUrls.size > 0 && (newUrls.length > 0 || removedUrls.length > 0);

      // Condition 3: first time (previousUrls empty) and there are uncached feeds
      const isFirstTime = previousUrls.size === 0;
      const hasUncachedFeeds = feeds.some(
        (feed) => cachedCounts[feed.url] === undefined,
      );

      return isCacheStale || feedsChanged || (isFirstTime && hasUncachedFeeds);
    },
    [],
  );

  // Cargar datos desde cache al montar
  useEffect(() => {
    if (!data || data.length === 0) return;

    const initData = async () => {
      const previousUrls = previousFeedUrlsRef.current;
      const currentUrls = new Set(data.map((f) => f.url));

      // Cargar counts desde cache
      const counts = await loadCachedCounts(data);

      // Load last refresh timestamp
      const lastRefresh = await feedCacheService.getLastFullRefresh();
      setLastFullRefreshAt(lastRefresh);

      // Verificar condiciones del toast
      const shouldToast = await checkShouldShowToast(
        data,
        counts,
        previousUrls,
      );
      setShouldShowUpdateToast(shouldToast);

      // Save current URLs for next comparison
      previousFeedUrlsRef.current = currentUrls;
    };

    initData();
  }, [data, loadCachedCounts, checkShouldShowToast]);

  // Actualizar todas las feeds con el nuevo flujo
  const refreshAllFeeds = useCallback(async () => {
    const feeds = data;
    if (!feeds || feeds.length === 0) return;

    setUpdating({ name: "FETCHING", current: 0, total: feeds.length });
    try {
      await feedService.fetchAndCacheAllFeedsRanked((name, current, total) =>
        setUpdating({ name, current, total }),
      );

      // Update counts from cache after fetch
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

      // Actualizar timestamp
      const now = new Date().toISOString();
      await feedCacheService.setLastFullRefresh(now);
      setLastFullRefreshAt(now);

      // Ocultar toast
      setShouldShowUpdateToast(false);
      previousFeedUrlsRef.current = new Set(feeds.map((f) => f.url));
    } finally {
      setUpdating(null);
    }
  }, [data]);

  const dismissToast = useCallback(() => {
    setShouldShowUpdateToast(false);
  }, []);

  const clearFeedArticleCounts = useCallback(() => {
    setFeedArticleCounts({});
  }, []);

  const refreshAndUpdateToast = useCallback(async () => {
    setShouldShowUpdateToast(false);
    await refreshAllFeeds();
  }, [refreshAllFeeds]);

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
        error: error || actionError,
        feedArticleCounts,
        updating,
        lastFullRefreshAt,
        shouldShowUpdateToast,
        getFeeds: refetchFeeds,
        importFeeds: handleImportFeeds,
        updateFeeds: handleUpdateFeeds,
        addOrEditFeed: handleAddOrEditFeed,
        deleteFeed: handleDeleteFeed,
        refreshAllFeeds,
        dismissToast,
        refreshAndUpdateToast,
        clearFeedArticleCounts,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeedsContext() {
  return useContext(FeedsContext);
}
