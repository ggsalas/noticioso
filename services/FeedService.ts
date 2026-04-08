import sanitize from "safe-html";
import { storageService, StorageService } from "./StorageService";
import { feedCacheService, FeedCacheService } from "./FeedCacheService";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import { articlePreloader, ArticlePreloader } from "./ArticlePreloader";
import {
  articleRankingService,
  ArticleRankingService,
} from "./ArticleRankingService";
import type { Feed, FeedData, FeedContentItem } from "~/types";
import { parseAndNormalizeFeed } from "@/lib/feedSchema";

const FEEDS_LIST_KEY = "@noticioso-feedList";

export class FeedService {
  constructor(
    private storage: StorageService,
    private cache: FeedCacheService,
    private articleCache: ArticleCacheService,
    private preloader: ArticlePreloader,
    private ranking: ArticleRankingService,
  ) {}

  // Obtiene contenido de cache INMEDIATAMENTE, sin importar antigüedad
  // No hace fetch en background - eso es responsabilidad del usuario
  getFeedContent = async (url: string): Promise<FeedData | undefined> => {
    const cached = await this.cache.get(url);

    if (cached) {
      // Enchanche with cached article metadata
      const enhancedItems = await this.enhanceItemsWithCache(
        cached.data.rss?.channel?.item,
      );
      const enhancedData: FeedData = {
        ...cached.data,
        rss: {
          ...cached.data.rss,
          channel: {
            ...cached.data.rss.channel,
            item: enhancedItems ?? [],
          },
        },
      };
      return enhancedData;
    }

    // No cache - return undefined so UI shows empty state
    return undefined;
  };

  // Basic fetch of a feed (without preload) - used internally
  private fetchFeedBasic = async (
    url: string,
  ): Promise<FeedData | undefined> => {
    try {
      const feed = await this.getFeedByUrl(url);

      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        throw new Error(
          `Failed to fetch feed from ${url}: ${res.status} ${res.statusText}`,
        );
      }

      const data = await res.text();
      const { feedType, channel } = parseAndNormalizeFeed(data);
      const items = this.filterByDate(channel.item, feed?.oldestArticle);

      const feedContent: FeedData = {
        date: new Date(),
        feedType,
        rss: {
          channel: {
            ...channel,
            title: channel.title,
            description: channel.description,
            language: channel.language,
            link: channel.link,
            lastBuildDate: channel.lastBuildDate,
            item: items ?? [],
          },
        },
      };

      // Cache the feed
      try {
        await this.cache.set(url, feedContent);
      } catch (cacheError) {
        console.warn(`Failed to cache feed ${url}:`, cacheError);
      }

      return feedContent;
    } catch (error) {
      console.error(`Error fetching feed content for ${url}:`, error);
      return undefined;
    }
  };

  // Get ALL updated feeds (basic metadata of each article)
  fetchAllFeeds = async (): Promise<FeedData[]> => {
    const feeds = await this.getFeeds();
    if (!feeds || feeds.length === 0) return [];

    const results: FeedData[] = [];

    for (const feed of feeds) {
      const feedContent = await this.fetchFeedBasic(feed.url);
      if (feedContent) {
        results.push(feedContent);
      }
    }

    return results;
  };

  // Orchestras: fetchAllFeeds -> setRanking -> preloadFeedItems
  fetchAndCacheAllFeedsRanked = async (
    onProgress?: (
      name: "FETCHING" | "PRELOADING",
      current: number,
      total: number,
    ) => void,
  ): Promise<void> => {
    const feeds = await this.getFeeds();
    if (!feeds || feeds.length === 0) return;

    const feedsData: FeedData[] = [];

    // 1. Fetch all feeds
    for (let i = 0; i < feeds.length; i++) {
      onProgress?.("FETCHING", i + 1, feeds.length);
      const feedContent = await this.fetchFeedBasic(feeds[i].url);
      if (feedContent) {
        feedsData.push(feedContent);
      }
    }

    // 2. Apply ranking and get scoreMap
    const { scoreMap } = await this.ranking.setRanking(feedsData);

    // 3. Filter articles with score >= 9 (only top 5 of each feed with score 10)
    const itemsToPreload = this.ranking.filterByScore(feedsData, scoreMap, 9);

    // 4. Preload selected articles
    await this.preloader.preloadFeedItems(itemsToPreload, (current, total) =>
      onProgress?.("PRELOADING", current, total),
    );
  };

  getFeeds = async (_?: undefined): Promise<Feed[] | undefined> => {
    const feedsData = await this.storage.getItem<Feed[]>(FEEDS_LIST_KEY);

    if (feedsData !== null) {
      return feedsData;
    } else {
      return [];
    }
  };

  getFeedByUrl = async (url: string): Promise<Feed | undefined> => {
    const feeds = await this.getFeeds();
    return feeds?.find((f) => f.url.includes(url));
  };

  createOrEditFeed = async (feed: Feed): Promise<boolean> => {
    try {
      const feeds = await this.getFeeds();
      const isExistingFeed = feeds && feeds?.some((f) => f.id === feed.id);
      const isValidFeed =
        feed.name && feed.url && feed.oldestArticle >= 1 && feed.lang;

      if (!isValidFeed) {
        throw new Error("Feed is not valid");
      }

      const getUpdatedFeeds = () => {
        if (isExistingFeed) {
          return feeds.map((f) => {
            if (f.id === feed.id) {
              return feed;
            } else {
              return f;
            }
          });
        } else {
          return Array.isArray(feeds) ? [...feeds, feed] : [feed];
        }
      };

      return await this.saveFeeds(getUpdatedFeeds());
    } catch {
      throw new Error("Feed cannot be added");
    }
  };

  deleteFeed = async (feed: Feed): Promise<boolean> => {
    try {
      const feeds = await this.getFeeds();
      const isExistingFeed = feeds && feeds?.some((f) => f.id === feed.id);

      if (!isExistingFeed) {
        throw new Error("Feed do not exist in the saved feeds");
      }

      const updatedFeeds = feeds.filter((f) => f.id !== feed.id);
      await this.cache.delete(feed.url);
      return await this.saveFeeds(updatedFeeds);
    } catch {
      throw new Error("Feed cannot be deleted");
    }
  };

  importFeeds = async (data: string): Promise<boolean> => {
    let feeds: unknown;
    try {
      feeds = JSON.parse(data);
    } catch {
      throw new Error("Invalid JSON format");
    }

    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw new Error("Data must be a non-empty array");
    }

    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      if (!this.isValidFeed(feed)) {
        throw new Error(`Invalid feed at index ${i}: ${JSON.stringify(feed)}`);
      }
    }

    await this.storage.setItem(FEEDS_LIST_KEY, feeds as Feed[]);
    return true;
  };

  private isValidFeed(feed: unknown): feed is Feed {
    const f = feed as Feed;
    const idValid = typeof f.id === "string" || typeof f.id === "number";
    const oldestValid =
      typeof f.oldestArticle === "number" ||
      typeof f.oldestArticle === "string";
    const oldestValue =
      typeof f.oldestArticle === "string"
        ? parseInt(f.oldestArticle, 10)
        : f.oldestArticle;
    return !!(
      idValid &&
      f.id &&
      typeof f.name === "string" &&
      f.name &&
      typeof f.url === "string" &&
      f.url &&
      oldestValid &&
      oldestValue >= 1 &&
      typeof f.lang === "string" &&
      f.lang
    );
  }

  removeAllFeeds = async (): Promise<void> => {
    await this.storage.setItem(FEEDS_LIST_KEY, []);
  };

  saveFeeds = async (feeds: Feed[]): Promise<boolean> => {
    await this.storage.setItem(FEEDS_LIST_KEY, feeds);
    return true;
  };

  private sanitizeContent(content: string): string {
    if (this.isHTML(content)) {
      return sanitize(content, { allowedTags: [] });
    } else {
      return content;
    }
  }

  private isHTML(str: string): boolean {
    const htmlPattern = /<[a-z][\s\S]*>/i;
    return htmlPattern.test(str);
  }

  private filterByDate(
    items: FeedContentItem[] | undefined,
    oldestArticle: number | undefined,
  ): FeedContentItem[] | undefined {
    if (!items) return undefined;

    const threshold = new Date(
      Date.now() - (oldestArticle ?? 1) * 24 * 60 * 60 * 1000,
    );

    return items.filter((item) => {
      if (!item.pubDate) return true;

      const itemDate = new Date(item.pubDate);
      if (isNaN(itemDate.getTime())) return true;

      return itemDate.getTime() > threshold.getTime();
    });
  }

  private enhanceItemsWithCache = async (
    items: FeedContentItem[] | undefined,
  ): Promise<FeedContentItem[] | undefined> => {
    if (!items) return undefined;

    const metadataResults = await Promise.all(
      items.map(async (item) => {
        try {
          const metadata = await this.articleCache.getMetadata(item.link);
          return { item, metadata };
        } catch {
          return { item, metadata: null };
        }
      }),
    );

    return metadataResults.map(({ item, metadata }) => {
      if (!metadata) return item;

      const hasValidByline =
        typeof metadata.byline === "string" &&
        metadata.byline.trim().length > 0;

      return {
        ...item,
        ...(hasValidByline && { author: metadata.byline }),
        ...(metadata.heroImage && { heroImage: metadata.heroImage }),
        ...(metadata.excerpt && { excerpt: metadata.excerpt }),
      };
    });
  };

  clearCaches = async (): Promise<void> => {
    await this.storage.clearCaches();
    await this.articleCache.clearFileCache();
  };
}

export const feedService = new FeedService(
  storageService,
  feedCacheService,
  articleCacheService,
  articlePreloader,
  articleRankingService,
);
