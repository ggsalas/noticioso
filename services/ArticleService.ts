import { Paths, File, Directory } from "expo-file-system";
import FeedRefreshModule from "@/modules/FeedRefreshModule";
import {
  articleMetadataRepository,
  ArticleMetadataRepository,
} from "@/db/ArticleMetadataRepository";
import type { ArticleMetadata } from "~/types";

export type ArticleData = {
  rawHtml: string;
  heroImage?: string;
  title?: string;
  byline?: string;
  siteName?: string;
};

/** Downloads one article into the shared cache (HTML file + metadata). */
export type ArticleDownloadFn = (url: string) => Promise<unknown>;

// CONTRACT with native (articles/ArticleFiles.kt), pinned by
// modules/FeedRefreshModule/contract/article-file-names.json: both runtimes read
// and write the same files, so folder and file name must be computed identically.
export const ARTICLE_HTML_DIRECTORY = "article-html";

export function articleFileName(url: string): string {
  return `${encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"))}.html`;
}

const htmlCacheDir = new Directory(Paths.cache, ARTICLE_HTML_DIRECTORY);

/**
 * Articles, from JS: READ access to the article cache (HTML files in
 * `<cache>/article-html/`, metadata in SQLite).
 *
 * Downloading and storing an article is done by the native module — in bulk after
 * each feed refresh, and one by one through `downloadArticle` when the user opens
 * an article that is not cached yet.
 */
export class ArticleService {
  constructor(
    private metadataRepo: ArticleMetadataRepository,
    private downloadArticle: ArticleDownloadFn,
  ) {}

  /** Article for reading: cached HTML + metadata, downloading it first if needed. */
  getArticle = async (url: string): Promise<ArticleData> => {
    let html = await this.getHtml(url);

    if (!html) {
      // Not cached yet: native downloads it, then we read it back
      await this.downloadArticle(url);
      html = await this.getHtml(url);
      if (!html) {
        throw new Error(`Article was downloaded but could not be read: ${url}`);
      }
    }

    const metadata = await this.getMetadata(url);

    return {
      rawHtml: html,
      heroImage: metadata?.heroImage,
      title: metadata?.title,
      byline: metadata?.byline,
      siteName: this.extractSiteName(html),
    };
  };

  /** Cached metadata (hero image, byline, title, excerpt), or null. */
  getMetadata = async (url: string): Promise<ArticleMetadata | null> => {
    return this.metadataRepo.getMetadata(url);
  };

  /** Cached HTML, or null. An article counts as cached only with metadata AND file. */
  getHtml = async (url: string): Promise<string | null> => {
    const metadata = await this.metadataRepo.getMetadata(url);
    if (!metadata) return null;

    try {
      const file = new File(this.getFilePath(url));
      if (!file.exists) return null;

      return await file.text();
    } catch {
      return null;
    }
  };

  /**
   * The URLs, among the given ones, that are fully cached (metadata row AND HTML
   * file). Used for the "all articles cached" indicator.
   */
  getFullyCachedUrls = async (urls: string[]): Promise<string[]> => {
    if (urls.length === 0) return [];

    const withMetadata = await this.metadataRepo.getMetadataPresentUrls(urls);

    return withMetadata.filter((url) => {
      try {
        return new File(this.getFilePath(url)).exists;
      } catch {
        return false;
      }
    });
  };

  private getFilePath = (url: string): string => {
    return new File(htmlCacheDir, articleFileName(url)).uri;
  };

  private extractSiteName(html: string): string | undefined {
    const match = html.match(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    );
    if (match?.[1]) return match[1];

    const match2 = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    );
    return match2?.[1];
  }
}

export const articleService = new ArticleService(articleMetadataRepository, (url) =>
  FeedRefreshModule.downloadArticle(url),
);
