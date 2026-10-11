import { EventSubscription } from "expo-modules-core";
import FeedRefreshModule from "@/modules/FeedRefreshModule/src/FeedRefreshModule";

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
