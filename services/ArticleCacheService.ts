import { articleCacheRepository, ArticleCacheRepository } from "@/infrastructure/ArticleCacheRepository";
import { Paths, File, Directory } from "expo-file-system";
import type { ArticleMetadata } from "~/types";

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

// File system directory for full HTML
const htmlCacheDir = new Directory(Paths.cache, "article-html");

export class ArticleCacheService {
  constructor(private articleCacheRepo: ArticleCacheRepository) {}

  // Check if URL exists in cache
  has = async (url: string): Promise<boolean> => {
    return this.articleCacheRepo.has(url);
  };

  // Get metadata (heroImage, author, etc.) from SQLite
  getMetadata = async (url: string): Promise<ArticleMetadata | null> => {
    return this.articleCacheRepo.getMetadata(url);
  };

  // Save: full HTML to filesystem, metadata to SQLite
  setHtml = async (url: string, html: string): Promise<void> => {
    const now = new Date().toISOString();

    // Make room if at limit
    const count = await this.articleCacheRepo.count();
    if (count >= MAX_ARTICLES) {
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

    // 2. Extract metadata and save to SQLite
    const metadata = {
      heroImage: extractHeroImage(html),
      byline: extractAuthor(html),
      title: extractTitle(html),
      excerpt: extractExcerpt(html),
      fetchedAt: now,
      lastAccessedAt: now,
    };

    await this.articleCacheRepo.setMetadata(url, metadata);
  };

  // Get full HTML from file system
  getHtml = async (url: string): Promise<string | null> => {
    const metadata = await this.articleCacheRepo.getMetadata(url);
    if (!metadata) return null;

    try {
      const file = new File(this.getFilePath(url));
      if (!file.exists) return null;

      const html = await file.text();

      // Update lastAccessedAt for LRU
      const now = new Date().toISOString();
      await this.articleCacheRepo.updateLastAccessed(url, now);

      return html;
    } catch {
      return null;
    }
  };

  private getFilePath = (url: string): string => {
    const safeName = encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"));
    return new File(htmlCacheDir, `${safeName}.html`).uri;
  };

  // Eviction - delete from both file system and database
  private removeOldest = async (): Promise<void> => {
    // Priority 1: Articles older than 7 days that were NEVER read
    const neverReadOld = await this.articleCacheRepo.getOldestNeverAccessed(
      MAX_ARTICLE_AGE_MS,
      1,
    );
    if (neverReadOld.length > 0) {
      await this.delete(neverReadOld[0].url);
      return;
    }

    // Priority 2: Fallback to LRU
    const oldest = await this.articleCacheRepo.getOldestByLastAccessed(1);
    if (oldest.length > 0) {
      await this.delete(oldest[0].url);
    }
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

    await this.articleCacheRepo.delete(url);
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

export const articleCacheService = new ArticleCacheService(articleCacheRepository);
