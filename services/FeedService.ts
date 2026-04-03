import sanitize from "safe-html";
import { storageService, StorageService } from "./StorageService";
import { feedCacheService, FeedCacheService } from "./FeedCacheService";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import { articlePreloader, ArticlePreloader } from "./ArticlePreloader";
import {
  backgroundScheduler,
  BackgroundScheduler,
} from "./BackgroundScheduler";
import type { Feed, FeedData, FeedContentItem } from "~/types";
import { parseAndNormalizeFeed } from "@/lib/feedSchema";

const FEEDS_LIST_KEY = "@noticioso-feedList";

export class FeedService {
  constructor(
    private storage: StorageService,
    private cache: FeedCacheService,
    private articleCache: ArticleCacheService,
    private preloader: ArticlePreloader,
    private scheduler: BackgroundScheduler,
  ) {}

  getFeedContent = async (
    url: string,
    onBackgroundFetched?: (data: FeedData) => void,
    forceRefetch?: boolean,
  ): Promise<{ data: FeedData; fromCache: boolean } | undefined> => {
    const cached = await this.cache.get(url);

    // Escenario 1 y 2: Hay cache → mostrar inmediatamente
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
      const isCacheOld = cacheAge > 60 * 1000; //3600000; // más de 1 hora

      // Escenario 2: Si el cache es viejo, hacer refresh en background
      if (forceRefetch || (isCacheOld && onBackgroundFetched)) {
        this.scheduler.add(async () => {
          const feedContent = await this.fetchAndCacheFeed(url);
          if (feedContent && onBackgroundFetched) {
            // Comparar: solo notificar si hay más artículos que antes
            const oldCount = cached.data.rss?.channel?.item?.length ?? 0;
            const newCount = feedContent.rss?.channel?.item?.length ?? 0;
            if (newCount > oldCount) {
              onBackgroundFetched(feedContent);
            }
          }
        });
      }

      return { data: cached.data, fromCache: true };
    }

    // Escenario 1 y 3: No hay cache → fetch bloqueante
    const freshData = await this.fetchAndCacheFeed(url);
    if (!freshData) {
      return undefined;
    }
    return { data: freshData, fromCache: false };
  };

  private fetchAndCacheFeed = async (
    url: string,
  ): Promise<FeedData | undefined> => {
    try {
      const feed = await this.getFeedByUrl(url);

      // Fetch and parse RSS content
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        throw new Error(
          `Failed to fetch feed from ${url}: ${res.status} ${res.statusText}`,
        );
      }

      const data = await res.text();
      const { feedType, channel } = parseAndNormalizeFeed(data);
      const items = this.filterByDate(channel.item, feed?.oldestArticle);

      // Preload articles into cache (await so metadata is available for enhanceItemsWithCache)
      const feeds = await this.getFeeds();
      const feedCount = feeds?.length ?? 1;

      await this.preloader.preloadForFeed(items, feedCount);

      // Enhance items with cached article metadata
      const enhancedItems = await this.enhanceItemsWithCache(items);

      // Build the normalized FeedData
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
            item: enhancedItems ?? [],
          },
        },
      };

      // Try to cache, but don't fail if cache returns error
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
    return !!(
      f.id &&
      typeof f.name === "string" &&
      f.name &&
      typeof f.url === "string" &&
      f.url &&
      typeof f.oldestArticle === "number" &&
      f.oldestArticle >= 1 &&
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
      // Include items without pubDate
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

    // Fetch metadata for all items in parallel
    const metadataResults = await Promise.all(
      items.map(async (item) => {
        try {
          const metadata = await this.articleCache.getMetadata(item.link);
          return { item, metadata };
        } catch {
          // Gracefully handle individual cache lookup failures
          return { item, metadata: null };
        }
      }),
    );

    // Map items with enhanced metadata
    return metadataResults.map(({ item, metadata }) => {
      if (!metadata) return item;

      // Use byline from cache as author if available, non-empty (after trim), and is a string
      const hasValidByline =
        typeof metadata.byline === "string" &&
        metadata.byline.trim().length > 0;

      return {
        ...item,
        // Replace author with byline from cache if valid
        ...(hasValidByline && { author: metadata.byline }),
        // Add cached metadata as extended fields
        ...(metadata.heroImage && { heroImage: metadata.heroImage }),
        ...(metadata.excerpt && { excerpt: metadata.excerpt }),
      };
    });
  };

  // Clear all caches (for debugging/testing)
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
  backgroundScheduler,
);
