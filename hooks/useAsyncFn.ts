import { useState, useEffect, useCallback } from "react";

type UseAsyncFn<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;

  runFn: () => Promise<void>;
};

export const useAsyncFn = <T>(
  fn: (params?: any) => Promise<T>,
  params?: any
): UseAsyncFn<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runFn = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fn(params);
      setData(result);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message); // Capture the error message
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, [fn, params]);

  useEffect(() => {
    runFn();
  }, [runFn]);

  return { data, loading, error, runFn };
};
