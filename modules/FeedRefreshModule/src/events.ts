import { EventSubscription } from "expo-modules-core";
import FeedRefreshModule from "./FeedRefreshModule";

export interface ArticleDownloadFeedStartedEvent {
  refreshId: string;
  feedCount: number;
  articleCount: number;
}

export interface ArticleDownloadFeedCompleteEvent {
  refreshId: string;
  feedUrl: string;
  feedIndex: number;
  feedCount: number;
  articleCount: number;
  articleSuccessCount: number;
  articleFailedCount: number;
}

/**
 * Subscribes to article download started events from native module.
 * Emitted before processing a feed's articles (including reconciliation).
 * These events are best-effort notifications - SQLite/file remain source of truth.
 */
export function onArticleDownloadFeedStarted(
  callback: (event: ArticleDownloadFeedStartedEvent) => void
): EventSubscription {
  return FeedRefreshModule.addListener("onArticleDownloadFeedStarted", callback);
}

/**
 * Subscribes to article download completion events from native module.
 * These events are best-effort notifications - SQLite/file remain source of truth.
 */
export function onArticleDownloadFeedComplete(
  callback: (event: ArticleDownloadFeedCompleteEvent) => void
): EventSubscription {
  return FeedRefreshModule.addListener("onArticleDownloadFeedComplete", callback);
}

export interface FeedRefreshFinishedEvent {
  refreshId: string | null;
  result: string;
}

/** A native feed pass started (direct call or one that was queued behind other work). */
export function onFeedRefreshStarted(
  callback: (event: { feedCount: number }) => void
): EventSubscription {
  return FeedRefreshModule.addListener("onFeedRefreshStarted", callback);
}

/** A native feed pass ended (a new pending generation may now exist). */
export function onFeedRefreshFinished(
  callback: (event: FeedRefreshFinishedEvent) => void
): EventSubscription {
  return FeedRefreshModule.addListener("onFeedRefreshFinished", callback);
}

/**
 * The native worker drained every task. Unlike per-feed events this is emitted on
 * every exit path, so it is the signal to clear transient progress UI.
 */
export function onArticleWorkerIdle(callback: () => void): EventSubscription {
  return FeedRefreshModule.addListener("onArticleWorkerIdle", callback);
}
