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

    // Callback para cuando llega data del background fetch
    const onBackgroundFetched = (fresh: FeedData) => {
      setData(fresh);
      setIsRefreshing(false);
    };

    try {
      setLoading(true);
      const result = await feedService.getFeedContent(url, onBackgroundFetched);

      // Escenario 1 y 2: Hay cache → mostrar inmediatamente
      if (result?.fromCache) {
        setData(result.data);
        setLoading(false);
        // Si hay cache viejo, va a venir refresh en background
        // isRefreshing se mantiene true hasta que llegue el callback
      }
      // Escenario 3: No hay cache → fetch bloqueante ya regresó
      else if (result) {
        setData(result.data);
        setLoading(false);
      }
      // Error al obtener datos
      else {
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  }, [url]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return { data, loading, isRefreshing, error };
};
