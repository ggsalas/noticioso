import sanitize from "safe-html";
import { storageService, StorageService } from "./StorageService";
import { feedCacheService, FeedCacheService } from "./FeedCacheService";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import { articlePreloader, ArticlePreloader } from "./ArticlePreloader";
import type { Feed, FeedData, FeedContentItem } from "~/types";
import { parseAndNormalizeFeed } from "@/lib/feedSchema";

const FEEDS_LIST_KEY = "@noticioso-feedList";
const ARTICLE_RANKING_KEY = "@noticioso-article-ranking";

export class FeedService {
  constructor(
    private storage: StorageService,
    private cache: FeedCacheService,
    private articleCache: ArticleCacheService,
    private preloader: ArticlePreloader,
  ) {}

  // Obtiene contenido de cache INMEDIATAMENTE, sin importar antigüedad
  // No hace fetch en background - eso es responsabilidad del usuario
  getFeedContent = async (
    url: string,
  ): Promise<FeedData | undefined> => {
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

    // No hay cache - devolver undefined para que la UI muestre estado vacío
    return undefined;
  };

  // Fetch básico de una feed (sin preload) - usado internamente
  private fetchFeedBasic = async (url: string): Promise<FeedData | undefined> => {
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

  // Obtiene TODAS las feeds actualizadas (metadata básica de cada artículo)
  // No garantiza todos los campos - algunas feeds tienen autor, otras no
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

  // Asigna ranking a cada artículo basado en fecha (más reciente = mejor ranking)
  // Guarda en storage con key ARTICLE_RANKING_KEY
  private setArticleRanking = async (
    allItems: FeedContentItem[],
  ): Promise<void> => {
    // Simple ranking: ordenar por pubDate descendente
    const rankedItems = [...allItems].sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return dateB - dateA; // Más reciente primero
    });

    // Crear mapa de ranking: link -> ranking (0 = mejor)
    const ranking: Record<string, number> = {};
    rankedItems.forEach((item, index) => {
      if (item.link) {
        ranking[item.link] = index;
      }
    });

    await this.storage.setItem(ARTICLE_RANKING_KEY, ranking);
  };

  // Orchestras: fetchAllFeeds -> setArticleRanking -> preloadFeedItems
  fetchAndCacheAllFeedsRanked = async (): Promise<void> => {
    const feeds = await this.getFeeds();
    if (!feeds || feeds.length === 0) return;

    const feedCount = feeds.length;
    const allItems: FeedContentItem[] = [];

    // 1. Fetch todas las feeds y收集artículos
    for (const feed of feeds) {
      const feedContent = await this.fetchFeedBasic(feed.url);
      if (feedContent?.rss?.channel?.item) {
        allItems.push(...feedContent.rss.channel.item);
      }
    }

    // 2. Aplicar ranking
    await this.setArticleRanking(allItems);

    // 3. Preload de los top N artículos (5 * feedCount)
    const topN = 5 * feedCount;
    const topItems = allItems.slice(0, topN);
    await this.preloader.preloadFeedItems(topItems);
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
);
