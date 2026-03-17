import { useState, useEffect, useCallback } from "react";
import { feedService } from "@/services/FeedService";
import type { FeedData } from "~/types";

type UseFeedContent = {
  data: FeedData | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
};

export const useFeedContent = (url: string): UseFeedContent => {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setError(null);

    let hadCache = false;

    const onCacheLoaded = (cached: FeedData) => {
      hadCache = true;
      setData(cached);
      setLoading(false);
      setIsRefreshing(true);
    };

    try {
      const fresh = await feedService.getFeedContent(url, onCacheLoaded);
      setData(fresh);
    } catch (err) {
      // If we already showed cached data, don't wipe it — just stop refreshing
      if (!hadCache) {
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [url]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return { data, loading, isRefreshing, error };
};
