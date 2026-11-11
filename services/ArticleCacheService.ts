import { articleCacheRepository, ArticleCacheRepository } from "@/infrastructure/ArticleCacheRepository";
import { Paths, File, Directory } from "expo-file-system";
import type { ArticleMetadata } from "~/types";

// File system directory for full HTML
const htmlCacheDir = new Directory(Paths.cache, "article-html");

/**
 * Read access to the article cache: HTML files in `<cache>/article-html/` and
 * metadata in SQLite. Articles are written by the native module only.
 */
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

  // Get full HTML from file system
  getHtml = async (url: string): Promise<string | null> => {
    const metadata = await this.articleCacheRepo.getMetadata(url);
    if (!metadata) return null;

    try {
      const file = new File(this.getFilePath(url));
      if (!file.exists) return null;

      const html = await file.text();
      return html;
    } catch {
      return null;
    }
  };

  // CONTRACT with native (ArticleFiles.kt): both sides must compute the same name
  private getFilePath = (url: string): string => {
    const safeName = encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"));
    return new File(htmlCacheDir, `${safeName}.html`).uri;
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

  /**
   * Get URLs from the provided list that have both metadata row AND final HTML file.
   * Used for cache completeness checks.
   */
  getFullyCachedUrls = async (urls: string[]): Promise<string[]> => {
    if (urls.length === 0) return [];

    // Get URLs with metadata rows
    const metadataPresentUrls = await this.articleCacheRepo.getMetadataPresentUrls(urls);

    // Filter by file existence
    const fullyCachedUrls: string[] = [];
    for (const url of metadataPresentUrls) {
      try {
        const file = new File(this.getFilePath(url));
        if (file.exists) {
          fullyCachedUrls.push(url);
        }
      } catch {
        // File check failed, skip this URL
      }
    }

    return fullyCachedUrls;
  };
}

export const articleCacheService = new ArticleCacheService(articleCacheRepository);
