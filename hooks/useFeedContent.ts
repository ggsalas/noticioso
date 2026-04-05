import { useState, useEffect, useCallback } from "react";
import { feedService } from "@/services/FeedService";
import type { FeedData } from "~/types";

type UseFeedContent = {
  data: FeedData | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refreshContent: () => Promise<void>;
};

export const useFeedContent = (url: string): UseFeedContent => {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setError(null);

    try {
      setLoading(true);
      const data = await feedService.getFeedContent(url);

      if (data) {
        setData(data);
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  }, [url]);

  const refreshContent = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await feedService.getFeedContent(url);
      if (data) {
        setData(data);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [url]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return {
    data,
    loading,
    isRefreshing,
    error,
    refreshContent,
  };
};
