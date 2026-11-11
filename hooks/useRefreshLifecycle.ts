import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import FeedRefreshModule from "@/modules/FeedRefreshModule";
import { FEED_REFRESH_QUEUED } from "@/modules/FeedRefreshModule/src/FeedRefreshModule.types";
import {
  onArticleDownloadFeedStarted,
  onArticleDownloadFeedComplete,
  onFeedRefreshStarted,
  onFeedRefreshFinished,
  onArticleWorkerIdle,
} from "@/modules/FeedRefreshModule/src/events";
import { feedRefreshService } from "@/services/FeedRefreshService";
import type { Feed } from "@/types";

export type FeedsUpdatingState = {
  name: "FETCHING";
  current: number;
  total: number;
} | null;

export type ArticleDownloadProgress = {
  refreshId: string;
  status: "fetching" | "complete";
  feedIndex: number;
  feedCount: number;
  articleCount: number;
  articleSuccessCount: number;
  articleFailedCount: number;
};

type Options = {
  feeds: Feed[] | null | undefined;
  /** A feed's articles finished downloading (its cache indicator may have changed). */
  onFeedArticlesDownloaded: (feedUrl: string) => void;
  onError: (message: string) => void;
};

/**
 * The refresh cycle as the UI sees it. The work happens in the native module;
 * this hook triggers it and mirrors its progress:
 *
 * - when to refresh: on mount and on returning to foreground, if the last feed
 *   pass is older than 1h (a pending unapplied generation does not block it),
 *   plus manual refresh
 * - `updating`: a feed pass is running
 * - `articleDownloadProgress`: articles are downloading
 * - `shouldShowUpdateToast`: a READY generation waits for the user to apply it
 */
export function useRefreshLifecycle({ feeds, onFeedArticlesDownloaded, onError }: Options) {
  const [updating, setUpdating] = useState<FeedsUpdatingState>(null);
  const [articleDownloadProgress, setArticleDownloadProgress] =
    useState<ArticleDownloadProgress | null>(null);
  const [shouldShowUpdateToast, setShouldShowUpdateToast] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  // Article download progress (per-feed native events)
  useEffect(() => {
    const started = onArticleDownloadFeedStarted((event) => {
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

    const completed = onArticleDownloadFeedComplete((event) => {
      setArticleDownloadProgress({
        refreshId: event.refreshId,
        status: event.feedIndex === event.feedCount ? "complete" : "fetching",
        feedIndex: event.feedIndex,
        feedCount: event.feedCount,
        articleCount: event.articleCount,
        articleSuccessCount: event.articleSuccessCount,
        articleFailedCount: event.articleFailedCount,
      });
      onFeedArticlesDownloaded(event.feedUrl);
    });

    return () => {
      started.remove();
      completed.remove();
    };
  }, [onFeedArticlesDownloaded]);

  // Feed pass + worker lifecycle (also covers queued refreshes JS did not await)
  useEffect(() => {
    const refreshStarted = onFeedRefreshStarted((event) => {
      setUpdating({ name: "FETCHING", current: 0, total: event.feedCount });
    });

    const refreshFinished = onFeedRefreshFinished(async () => {
      setUpdating(null);
      if (await feedRefreshService.hasPendingRefresh()) {
        setShouldShowUpdateToast(true);
      }
    });

    // Terminal event: emitted whenever the worker drains, including early exits
    // (superseded generation, errors) that skip the last per-feed event.
    const workerIdle = onArticleWorkerIdle(() => {
      setUpdating(null);
      setArticleDownloadProgress((prev) =>
        prev?.status === "fetching" ? { ...prev, status: "complete" } : prev,
      );
    });

    return () => {
      refreshStarted.remove();
      refreshFinished.remove();
      workerIdle.remove();
    };
  }, []);

  // Never dropped: if the worker is busy native queues the refresh and the
  // started/finished events report it later. Deliberately independent of transient
  // UI state so a stale closure can't skip it. Does NOT touch counts or timestamps:
  // those change only when the user applies the new generation.
  const refreshAllFeeds = useCallback(async () => {
    if (!feeds || feeds.length === 0) return;

    try {
      const result = await feedRefreshService.refreshAllFeeds();
      if (result === FEED_REFRESH_QUEUED) return;

      // Direct run: the pass already finished
      if (await feedRefreshService.hasPendingRefresh()) {
        setShouldShowUpdateToast(true);
      }
    } catch (e) {
      console.error("Failed to refresh feeds:", e);
      onError("Failed to refresh feeds");
    }
  }, [feeds, onError]);

  /** Show the toast exactly when a READY generation exists. */
  const syncToast = useCallback(async () => {
    setShouldShowUpdateToast(await feedRefreshService.hasPendingRefresh());
  }, []);

  const checkToastAndMaybeRefresh = useCallback(async () => {
    if (await feedRefreshService.hasPendingRefresh()) {
      setShouldShowUpdateToast(true);
    }
    if (await feedRefreshService.shouldRefresh()) {
      await refreshAllFeeds();
    }
  }, [refreshAllFeeds]);

  // Once, when the feed list is first available
  const initialCheckDone = useRef(false);
  useEffect(() => {
    if (!feeds || feeds.length === 0 || initialCheckDone.current) return;
    initialCheckDone.current = true;
    checkToastAndMaybeRefresh();
  }, [feeds, checkToastAndMaybeRefresh]);

  // On returning to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const cameToForeground =
        appStateRef.current.match(/inactive|background/) && nextAppState === "active";
      appStateRef.current = nextAppState;
      if (!cameToForeground) return;

      // Safety net for events lost while JS was paused: if native is idle,
      // no feed pass or article download can be in progress.
      if (!FeedRefreshModule.isWorkerBusy()) {
        setUpdating(null);
        setArticleDownloadProgress(null);
      }

      await checkToastAndMaybeRefresh();
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [checkToastAndMaybeRefresh]);

  const dismissToast = useCallback(() => {
    setShouldShowUpdateToast(false);
  }, []);

  /** After "Clear cache": no generation exists anymore. */
  const reset = useCallback(() => {
    setShouldShowUpdateToast(false);
    setArticleDownloadProgress(null);
  }, []);

  return {
    updating,
    articleDownloadProgress,
    shouldShowUpdateToast,
    refreshAllFeeds,
    syncToast,
    dismissToast,
    reset,
  };
}
