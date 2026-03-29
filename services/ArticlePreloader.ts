import { batchPromises } from "@/lib/batchPromises";
import { articleService, ArticleService } from "./ArticleService";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import type { FeedContentItem } from "~/types";

export interface PreloadConfig {
  totalArticles: number;
  maxPerFeed: number;
  activeFeedCount: number;
  maxConcurrentDownloads: number;
}

const DEFAULT_CONFIG: PreloadConfig = {
  totalArticles: 200,
  maxPerFeed: 10,
  activeFeedCount: 1,
  maxConcurrentDownloads: 3,
};

export class ArticlePreloader {
  constructor(
    private articleService: ArticleService,
    private articleCache: ArticleCacheService,
    private config: PreloadConfig,
  ) {}

  preloadForFeed = async (
    items: FeedContentItem[] | undefined,
    feedCount: number,
  ): Promise<void> => {
    if (!items || items.length === 0) return;

    // Calculate how many articles to preload for this feed
    const articlesPerFeed = Math.min(
      this.config.maxPerFeed,
      Math.ceil(this.config.totalArticles / feedCount),
    );

    // Take first N items in feed order (sequential)
    const selectedItems = items.slice(0, articlesPerFeed);
    if (selectedItems.length === 0) return;

    // Extract URLs
    const urls = selectedItems.map((item) => item.link).filter(Boolean);

    // Filter out already cached articles
    const urlsToFetch = await this.filterUncachedUrls(urls);
    if (urlsToFetch.length === 0) return;

    // Download in batches using batchPromises
    const tasks = urlsToFetch.map(
      (url) => () => this.articleService.fetchArticleContent(url),
    );

    await batchPromises(tasks, this.config.maxConcurrentDownloads);
  };

  private filterUncachedUrls = async (urls: string[]): Promise<string[]> => {
    if (urls.length === 0) return [];

    // Check cache in parallel for all URLs
    const results = await Promise.all(
      urls.map(async (url) => {
        const metadata = await this.articleCache.getMetadata(url);
        return { url, metadata };
      }),
    );

    // Return only URLs that are not in cache
    return results
      .filter(({ metadata }) => metadata === null)
      .map(({ url }) => url);
  };
}

export const articlePreloader = new ArticlePreloader(
  articleService,
  articleCacheService,
  DEFAULT_CONFIG,
);
