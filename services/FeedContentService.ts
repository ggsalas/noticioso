import { refreshRepository, feedSnapshotRepository } from "@/db";
import { articleService, ArticleService } from "./ArticleService";
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
  constructor(private articles: ArticleService) {}

  /**
   * Raw snapshot of a feed in the active generation.
   */
  getSnapshot = async (url: string): Promise<FeedSnapshot | null> => {
    const active = await refreshRepository.getActive();
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
   * Number of articles each feed has in the active generation.
   * Feeds without a snapshot are omitted.
   */
  getArticleCounts = async (feedUrls: string[]): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};

    await Promise.allSettled(
      feedUrls.map(async (feedUrl) => {
        const snapshot = await this.getSnapshot(feedUrl);
        if (snapshot) {
          counts[feedUrl] = snapshot.data.rss?.channel?.item?.length ?? 0;
        }
      }),
    );

    return counts;
  };

  /**
   * For each feed, whether ALL its articles in the active generation are cached
   * (metadata + HTML file). Nothing is persisted: it is derived on demand.
   * - no snapshot for the feed -> false
   * - snapshot with zero articles -> omitted (the UI shows no indicator)
   */
  getCacheCompleteness = async (feedUrls: string[]): Promise<Record<string, boolean>> => {
    const completeness: Record<string, boolean> = {};

    const active = await refreshRepository.getActive();
    if (!active) return completeness;

    const snapshots = await feedSnapshotRepository.getAllForRefresh(active.refreshId);
    const snapshotByFeed = new Map(snapshots.map((snapshot) => [snapshot.feedUrl, snapshot]));

    await Promise.allSettled(
      feedUrls.map(async (feedUrl) => {
        const snapshot = snapshotByFeed.get(feedUrl);
        if (!snapshot) {
          completeness[feedUrl] = false;
          return;
        }

        const urls = this.articleUrls(snapshot.data);
        if (urls.length === 0) return;

        completeness[feedUrl] = await this.areAllCached(urls);
      }),
    );

    return completeness;
  };

  /** Same check as getCacheCompleteness for a single feed (after a native per-feed event). */
  isFeedFullyCached = async (feedUrl: string): Promise<boolean> => {
    const snapshot = await this.getSnapshot(feedUrl);
    const urls = snapshot ? this.articleUrls(snapshot.data) : [];
    return urls.length > 0 && (await this.areAllCached(urls));
  };

  private articleUrls(data: FeedData): string[] {
    return (data.rss?.channel?.item ?? [])
      .map((item) => item.link)
      .filter((url) => url && url.trim().length > 0);
  }

  private async areAllCached(urls: string[]): Promise<boolean> {
    const cached = new Set(await this.articles.getFullyCachedUrls(urls));
    return urls.every((url) => cached.has(url));
  }

  /**
   * When the active generation was applied (toast tap). Shown as "Last full update".
   */
  getLastFullRefresh = async (): Promise<string | null> => {
    const active = await refreshRepository.getActive();
    return active?.appliedAt ?? null;
  };

  private enhanceItemsWithCache = async (
    items: FeedContentItem[] | undefined,
  ): Promise<FeedContentItem[] | undefined> => {
    if (!items) return undefined;

    const metadataResults = await Promise.all(
      items.map(async (item) => {
        try {
          const metadata = await this.articles.getMetadata(item.link);
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

export const feedContentService = new FeedContentService(articleService);
