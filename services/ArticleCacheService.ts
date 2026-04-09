import { storageService, StorageService } from "./StorageService";
import { Paths, File, Directory } from "expo-file-system";
import type {
  ArticleMetadata,
  ArticleHtmlCacheEntry,
  ArticleCacheIndex,
} from "~/types";

const ARTICLE_HTML_CACHE_PREFIX = "@noticioso-articleHtmlCache-";
const ARTICLE_INDEX_KEY = "@noticioso-articleHtmlCache-index";

// File system directory for full HTML
const htmlCacheDir = new Directory(Paths.cache, "article-html");

const MAX_ARTICLES = 300;
const MAX_ARTICLE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Regex patterns for metadata extraction (no DOM parsing)
function extractHeroImage(html: string): string | undefined {
  if (!html) return undefined;

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function extractAuthor(html: string): string {
  if (!html) return "";

  const patterns = [
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']author["']/i,
    /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']dc\.creator["'][^>]+content=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function extractTitle(html: string): string {
  if (!html) return "";

  const ogTitleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (ogTitleMatch?.[1]) return ogTitleMatch[1];

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  return "";
}

function extractExcerpt(html: string): string {
  if (!html) return "";

  const ogDescMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  if (ogDescMatch?.[1]) return ogDescMatch[1];

  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  if (descMatch?.[1]) return descMatch[1];

  return "";
}

export class ArticleCacheService {
  constructor(private storage: StorageService) {}

  // Check if URL exists in cache
  has = async (url: string): Promise<boolean> => {
    const entry = await this.storage.getItem<ArticleHtmlCacheEntry>(
      this.cacheKey(url),
    );
    return entry !== null;
  };

  // Get metadata (heroImage, author, etc.) from AsyncStorage
  getMetadata = async (url: string): Promise<ArticleMetadata | null> => {
    const entry = await this.storage.getItem<ArticleHtmlCacheEntry>(
      this.cacheKey(url),
    );
    if (!entry) return null;

    // Return metadata fields directly
    return {
      heroImage: entry.heroImage,
      byline: entry.byline || "",
      title: entry.title || "",
      excerpt: entry.excerpt || "",
    };
  };

  // Save: full HTML to filesystem, metadata to AsyncStorage
  setHtml = async (url: string, html: string): Promise<void> => {
    // Make room if at limit
    const index = await this.getIndex();
    if (Object.keys(index).length >= MAX_ARTICLES) {
      await this.removeOldest();
    }

    // 1. Save FULL HTML to file system (for article viewing)
    try {
      if (!htmlCacheDir.exists) {
        htmlCacheDir.create();
      }
      const file = new File(this.getFilePath(url));
      await file.write(html);
    } catch (error) {
      console.warn("Failed to save HTML to file system:", error);
    }

    // 2. Extract metadata and save to AsyncStorage (as fields, not JSON string)
    const entry: ArticleHtmlCacheEntry = {
      heroImage: extractHeroImage(html),
      byline: extractAuthor(html),
      title: extractTitle(html),
      excerpt: extractExcerpt(html),
      fetchedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };

    await this.storage.setItem(this.cacheKey(url), entry);
    await this.addToIndex(url, entry.fetchedAt);
  };

  // Get full HTML from file system
  getHtml = async (url: string): Promise<string | null> => {
    const entry = await this.storage.getItem<ArticleHtmlCacheEntry>(
      this.cacheKey(url),
    );
    if (!entry) return null;

    try {
      const file = new File(this.getFilePath(url));
      if (!file.exists) return null;

      const html = await file.text();

      // Update lastAccessedAt for LRU
      entry.lastAccessedAt = new Date().toISOString();
      await this.storage.setItem(this.cacheKey(url), entry);

      // Update index
      const index = await this.getIndex();
      if (index[url]) {
        index[url].lastAccessedAt = entry.lastAccessedAt;
        await this.updateIndex(index);
      }

      return html;
    } catch {
      return null;
    }
  };

  private getFilePath = (url: string): string => {
    const safeName = encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"));
    return new File(htmlCacheDir, `${safeName}.html`).uri;
  };

  private cacheKey = (url: string): string =>
    `${ARTICLE_HTML_CACHE_PREFIX}${url}`;

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

  // Eviction - delete from both file system and index
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

    // Priority 2: Fallback to LRU
    const oldest = entries.reduce((prev, curr) =>
      new Date(prev[1].lastAccessedAt) < new Date(curr[1].lastAccessedAt)
        ? prev
        : curr,
    );

    await this.delete(oldest[0]);
  };

  private delete = async (url: string): Promise<void> => {
    // Delete from file system
    try {
      const file = new File(this.getFilePath(url));
      if (file.exists) {
        file.delete();
      }
    } catch {
      // File might not exist
    }

    await this.storage.removeItem(this.cacheKey(url));
    await this.removeFromIndex(url);
  };

  // Clear file cache
  clearFileCache = async (): Promise<void> => {
    try {
      if (htmlCacheDir.exists) {
        const files = htmlCacheDir.list();
        for (const file of files) {
          file.delete();
        }
      }
    } catch (error) {
      console.warn("Failed to clear file cache:", error);
    }
  };
}

export const articleCacheService = new ArticleCacheService(storageService);
