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

type FeedsContextType = {
  loading?: boolean;
  error?: string | null;
  feeds?: Feed[] | null;
  feedArticleCounts: Record<string, number>;
  updating: boolean;
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
};

const FeedsContext = createContext<FeedsContextType>({
  feedArticleCounts: {},
  updating: false,
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
  const [updating, setUpdating] = useState(false);
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
    async (feeds: Feed[], cachedCounts: Record<string, number>) => {
      if (!feeds || feeds.length === 0) return false;

      const lastRefresh = await feedCacheService.getLastFullRefresh();
      
      // Condición 1: cache está stale (pasó el tiempo mínimo)
      const staleThreshold = Date.now() - CACHE_STALE_TIME_MS;
      const isCacheStale =
        lastRefresh === null ||
        new Date(lastRefresh).getTime() < staleThreshold;

      // Condición 2: feeds nuevos o eliminados (comparar con estado anterior)
      const currentUrls = new Set(feeds.map((f) => f.url));
      const feedsChanged =
        previousFeedUrlsRef.current.size > 0 &&
        (currentUrls.size !== previousFeedUrlsRef.current.size ||
          ![...currentUrls].every((url) => previousFeedUrlsRef.current.has(url)));

      return isCacheStale || feedsChanged;
    },
    [],
  );

  // Cargar datos desde cache al montar
  useEffect(() => {
    if (!data || data.length === 0) return;

    const initData = async () => {
      // Cargar counts desde cache
      const counts = await loadCachedCounts(data);
      
      // Cargar timestamp de última actualización
      const lastRefresh = await feedCacheService.getLastFullRefresh();
      setLastFullRefreshAt(lastRefresh);

      // Verificar condiciones del toast
      const shouldToast = await checkShouldShowToast(data, counts);
      setShouldShowUpdateToast(shouldToast);

      // Guardar URLs actuales para detección de cambios
      previousFeedUrlsRef.current = new Set(data.map((f) => f.url));
    };

    initData();
  }, [data, loadCachedCounts, checkShouldShowToast]);

  // Actualizar todas las feeds con el nuevo flujo
  const refreshAllFeeds = useCallback(async () => {
    const feeds = data;
    if (!feeds || feeds.length === 0) return;

    setUpdating(true);
    try {
      await feedService.fetchAndCacheAllFeedsRanked();

      // Actualizar counts desde cache después del fetch
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
      setUpdating(false);
    }
  }, [data]);

  const dismissToast = useCallback(() => {
    setShouldShowUpdateToast(false);
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
      throw new Error(message);
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
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeedsContext() {
  return useContext(FeedsContext);
}
