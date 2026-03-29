import { storageService, StorageService } from "./StorageService";
import type {
  Article,
  ArticleMetadata,
  ArticleCacheEntry,
  ArticleCacheIndex,
} from "~/types";

const ARTICLE_CACHE_PREFIX = "@noticioso-articleCache-";
const ARTICLE_INDEX_KEY = "@noticioso-articleCache-index";

const MAX_ARTICLES = 300;
const MAX_ARTICLE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class ArticleCacheService {
  constructor(private storage: StorageService) {}

  get = async (url: string): Promise<Article | null> => {
    const entry = await this.storage.getItem<ArticleCacheEntry>(
      this.cacheKey(url),
    );
    if (!entry) return null;

    // Update lastAccessedAt for LRU
    entry.lastAccessedAt = new Date().toISOString();
    await this.storage.setItem(this.cacheKey(url), entry);

    // Update index
    const index = await this.getIndex();
    if (index[url]) {
      index[url].lastAccessedAt = entry.lastAccessedAt;
      await this.updateIndex(index);
    }

    return entry.article;
  };

  getMetadata = async (url: string): Promise<ArticleMetadata | null> => {
    const entry = await this.storage.getItem<ArticleCacheEntry>(
      this.cacheKey(url),
    );
    if (!entry) return null;

    return {
      heroImage: entry.article.heroImage,
      byline: entry.article.byline || "",
      title: entry.article.title || "",
      excerpt: entry.article.excerpt || "",
    };
  };

  set = async (url: string, article: Article): Promise<void> => {
    // Make room if at limit
    const index = await this.getIndex();
    if (Object.keys(index).length >= MAX_ARTICLES) {
      await this.removeOldest();
    }

    // Save article
    const entry: ArticleCacheEntry = {
      article,
      cachedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };
    await this.storage.setItem(this.cacheKey(url), entry);
    await this.addToIndex(url, entry.cachedAt);
  };

  private delete = async (url: string): Promise<void> => {
    await this.storage.removeItem(this.cacheKey(url));
    await this.removeFromIndex(url);
  };

  private cacheKey = (url: string): string => `${ARTICLE_CACHE_PREFIX}${url}`;

  // Index management
  private getIndex = async (): Promise<ArticleCacheIndex> => {
    const index =
      await this.storage.getItem<ArticleCacheIndex>(ARTICLE_INDEX_KEY);
    return index || {};
  };

  private updateIndex = async (index: ArticleCacheIndex): Promise<void> => {
    await this.storage.setItem(ARTICLE_INDEX_KEY, index);
  };

  private addToIndex = async (url: string, cachedAt: string): Promise<void> => {
    const index = await this.getIndex();
    index[url] = { cachedAt, lastAccessedAt: cachedAt };
    await this.updateIndex(index);
  };

  private removeFromIndex = async (url: string): Promise<void> => {
    const index = await this.getIndex();
    delete index[url];
    await this.updateIndex(index);
  };

  // Eviction algorithm
  private removeOldest = async (): Promise<void> => {
    const index = await this.getIndex();
    const entries = Object.entries(index);
    const now = Date.now();

    if (entries.length === 0) return;

    // Priority 1: Articles older than 7 days that were NEVER read
    const neverReadOld = entries.find(([, meta]) => {
      const age = now - new Date(meta.cachedAt).getTime();
      const neverOpened = meta.lastAccessedAt === meta.cachedAt;
      return age > MAX_ARTICLE_AGE_MS && neverOpened;
    });

    if (neverReadOld) {
      await this.delete(neverReadOld[0]);
      return;
    }

    // Priority 2: Fallback to LRU (least recently accessed)
    const oldest = entries.reduce((prev, curr) =>
      new Date(prev[1].lastAccessedAt) < new Date(curr[1].lastAccessedAt)
        ? prev
        : curr,
    );

    await this.delete(oldest[0]);
  };
}

export const articleCacheService = new ArticleCacheService(storageService);
