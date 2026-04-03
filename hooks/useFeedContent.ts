import { useState, useEffect, useCallback } from "react";
import { feedService } from "@/services/FeedService";
import type { FeedData } from "~/types";

type UseFeedContent = {
  data: FeedData | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasNewArticles: boolean;
  dismissNewArticlesToast: () => void;
  refreshAndShowToast: () => void;
};

export const useFeedContent = (url: string): UseFeedContent => {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNewArticles, setHasNewArticles] = useState(false);

  const fetchContent = useCallback(async () => {
    setError(null);

    // Callback para cuando llega data del background fetch
    const onBackgroundFetched = () => {
      setHasNewArticles(true);
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

  // Función para refrescar manualmente (cuando el usuario toca el toast)
  const refreshAndShowToast = useCallback(async () => {
    setHasNewArticles(false);
    // Usar forceRefetch=true para forzar fetch fresco desde la red
    const result = await feedService.getFeedContent(url, undefined, true);
    // El problema es que getFeedContent retorna el cache inmediatamente y hace fetch en background
    // Pero necesitamos esperar el resultado fresco
    // Por ahora usamos el workaround: volver a llamar que fuerza actualización
    setLoading(true);
    const freshResult = await feedService.getFeedContent(url, undefined, true);
    if (freshResult) {
      setData(freshResult.data);
    }
    setLoading(false);
  }, [url]);

  const dismissNewArticlesToast = useCallback(() => {
    setHasNewArticles(false);
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return { data, loading, isRefreshing, error, hasNewArticles, dismissNewArticlesToast, refreshAndShowToast };
};
