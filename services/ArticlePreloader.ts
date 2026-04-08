import { batchPromises } from "@/lib/batchPromises";
import { articleService, ArticleService } from "./ArticleService";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import type { FeedContentItem } from "~/types";

export interface PreloadConfig {
  maxConcurrentDownloads: number;
}

const DEFAULT_CONFIG: PreloadConfig = {
  maxConcurrentDownloads: 5,
};

export class ArticlePreloader {
  constructor(
    private articleService: ArticleService,
    private articleCache: ArticleCacheService,
    private config: PreloadConfig,
  ) {}

  // Preload a list of feed articles
  preloadFeedItems = async (
    items: FeedContentItem[] | undefined,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> => {
    if (!items || items.length === 0) return;

    const urls = items.map((item) => item.link).filter(Boolean);
    const urlsToFetch = await this.filterUncachedUrls(urls);
    if (urlsToFetch.length === 0) return;

    const tasks = urlsToFetch.map((url, index) => () => {
      onProgress?.(index + 1, urlsToFetch.length);
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
