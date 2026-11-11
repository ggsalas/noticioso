import { activeRefreshRepository, feedSnapshotRepository } from "@/infrastructure";
import {
  articleCacheService,
  ArticleCacheService,
} from "./ArticleCacheService";
import type { FeedData, FeedContentItem } from "~/types";

export type FeedSnapshot = {
  data: FeedData;
  cachedAt: string; // ISO timestamp
};

/**
 * Read side of the feed pipeline.
 *
 * The native module (Kotlin) fetches, parses and writes feed snapshots per
 * generation. JS never writes feed content: this service only reads the
 * ACTIVE generation (the one the user sees until the toast is applied).
 */
export class FeedContentService {
  constructor(private articleCache: ArticleCacheService) {}

  /**
   * Raw snapshot of a feed in the active generation.
   */
  getSnapshot = async (url: string): Promise<FeedSnapshot | null> => {
    const active = await activeRefreshRepository.get();
    if (!active) {
      return null;
    }

    const snapshot = await feedSnapshotRepository.get(active.refreshId, url);
    if (!snapshot) {
      return null;
    }

    return {
      data: snapshot.data,
      cachedAt: snapshot.cachedAt,
    };
  };

  /**
   * Feed content for display: the active snapshot with each item enriched
   * with cached article metadata (author, hero image, excerpt).
   * Returns undefined when there is no snapshot so the UI shows its empty state.
   */
  getFeedContent = async (url: string): Promise<FeedData | undefined> => {
    const snapshot = await this.getSnapshot(url);
    if (!snapshot) return undefined;

    const enhancedItems = await this.enhanceItemsWithCache(
      snapshot.data.rss?.channel?.item,
    );

    return {
      ...snapshot.data,
      rss: {
        ...snapshot.data.rss,
        channel: {
          ...snapshot.data.rss.channel,
          item: enhancedItems ?? [],
        },
      },
    };
  };

  /**
   * When the active generation was applied (toast tap). Shown as "Last full update".
   */
  getLastFullRefresh = async (): Promise<string | null> => {
    const active = await activeRefreshRepository.get();
    return active?.appliedAt ?? null;
  };

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
}

export const feedContentService = new FeedContentService(articleCacheService);
