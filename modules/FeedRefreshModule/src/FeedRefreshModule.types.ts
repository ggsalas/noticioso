export type FeedRefreshModuleEvents = {
  onArticleDownloadFeedStarted: (event: {
    refreshId: string;
    feedCount: number;
    articleCount: number;
  }) => void;
  onArticleDownloadFeedComplete: (event: {
    refreshId: string;
    feedUrl: string;
    feedIndex: number;
    feedCount: number;
    articleCount: number;
    articleSuccessCount: number;
    articleFailedCount: number;
  }) => void;
  /** A feed pass started on the native worker (direct or previously queued). */
  onFeedRefreshStarted: (event: { feedCount: number }) => void;
  /** A feed pass ended. refreshId is null when it failed before producing a generation. */
  onFeedRefreshFinished: (event: { refreshId: string | null; result: string }) => void;
  /** The native worker drained all tasks. Guaranteed terminal event for progress UI. */
  onArticleWorkerIdle: (event: Record<string, never>) => void;
};

/** Returned by refreshFeeds when the request was queued behind running native work. */
export const FEED_REFRESH_QUEUED = "Feed refresh queued";

export type NativeFeedInput = {
  id: string;
  name: string;
  url: string;
  oldestArticle: number;
  lang: string;
};
