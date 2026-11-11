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
   * For each feed, whether the native module already TRIED to download every
   * article it lists in the active generation (each one completed or failed).
   * This is the ● in the feed list: a freshly applied generation shows none
   * until its downloads are attempted. Derived on demand from
   * article_download_jobs; nothing extra is persisted.
   * - no snapshot for the feed -> false
   * - snapshot with zero articles -> omitted (the UI shows no indicator)
   */
  getDownloadsAttempted = async (feedUrls: string[]): Promise<Record<string, boolean>> => {
    const attempted: Record<string, boolean> = {};

    const active = await refreshRepository.getActive();
    if (!active) return attempted;

    const snapshots = await feedSnapshotRepository.getAllForRefresh(active.refreshId);
    const snapshotByFeed = new Map(snapshots.map((snapshot) => [snapshot.feedUrl, snapshot]));
    const attemptedUrls = new Set(await refreshRepository.getAttemptedArticleUrls(active.refreshId));

    await Promise.allSettled(
      feedUrls.map(async (feedUrl) => {
        const snapshot = snapshotByFeed.get(feedUrl);
        if (!snapshot) {
          attempted[feedUrl] = false;
          return;
        }

        const urls = this.articleUrls(snapshot.data);
        if (urls.length === 0) return;

        attempted[feedUrl] = urls.every((url) => attemptedUrls.has(url));
      }),
    );

    return attempted;
  };

  /** Same check as getDownloadsAttempted for a single feed (after a native per-feed event). */
  isFeedDownloadAttempted = async (feedUrl: string): Promise<boolean> => {
    const active = await refreshRepository.getActive();
    if (!active) return false;

    const snapshot = await feedSnapshotRepository.get(active.refreshId, feedUrl);
    const urls = snapshot ? this.articleUrls(snapshot.data) : [];
    if (urls.length === 0) return false;

    const attemptedUrls = new Set(await refreshRepository.getAttemptedArticleUrls(active.refreshId));
    return urls.every((url) => attemptedUrls.has(url));
  };

  private articleUrls(data: FeedData): string[] {
    return (data.rss?.channel?.item ?? [])
      .map((item) => item.link)
      .filter((url) => url && url.trim().length > 0);
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
