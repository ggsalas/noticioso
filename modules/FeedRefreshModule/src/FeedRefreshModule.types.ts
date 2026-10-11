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
};

export type NativeFeedInput = {
  id: string;
  name: string;
  url: string;
  oldestArticle: number;
  lang: string;
};
