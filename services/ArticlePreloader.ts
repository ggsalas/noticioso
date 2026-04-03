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
  maxConcurrentDownloads: 1,
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

    const articlesPerFeed = Math.min(
      this.config.maxPerFeed,
      Math.ceil(this.config.totalArticles / feedCount),
    );

    // Take first N items in feed order
    const selectedItems = items.slice(0, articlesPerFeed);
    if (selectedItems.length === 0) return;

    // Filter out already cached articles
    const urls = selectedItems.map((item) => item.link).filter(Boolean);
    const urlsToFetch = await this.filterUncachedUrls(urls);
    if (urlsToFetch.length === 0) return;

    // Download in batches (using fetchAndCacheHtml since we already filtered uncached URLs)
    const tasks = urlsToFetch.map((url) => () => {
      return this.articleService.fetchAndCacheHtml(url);
    });

    await batchPromises(tasks, this.config.maxConcurrentDownloads);
  };

  private filterUncachedUrls = async (urls: string[]): Promise<string[]> => {
    if (urls.length === 0) return [];

    // Check if URL exists in cache using has() method
    const results = await Promise.all(
      urls.map(async (url) => {
        const exists = await this.articleCache.has(url);
        return { url, exists };
      }),
    );

    // Return only URLs that are NOT in cache
    return results.filter(({ exists }) => !exists).map(({ url }) => url);
  };
}

export const articlePreloader = new ArticlePreloader(
  articleService,
  articleCacheService,
  DEFAULT_CONFIG,
);
