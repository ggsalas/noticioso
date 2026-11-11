import FeedRefreshModule from "@/modules/FeedRefreshModule";
import { articleCacheService, ArticleCacheService } from "./ArticleCacheService";

export type ArticleData = {
  rawHtml: string;
  heroImage?: string;
  title?: string;
  byline?: string;
  siteName?: string;
};

/** Downloads one article into the shared cache (HTML file + metadata). */
export type ArticleDownloadFn = (url: string) => Promise<unknown>;

/**
 * Article content for reading.
 *
 * JS only READS the article cache. Downloading (HTML + metadata) is done by the
 * native module, both for the bulk pre-download and for this on-demand path, so
 * there is a single implementation of "download and store an article".
 */
export class ArticleService {
  constructor(
    private cache: ArticleCacheService,
    private downloadArticle: ArticleDownloadFn,
  ) {}

  getArticle = async (url: string): Promise<ArticleData> => {
    let html = await this.cache.getHtml(url);

    if (!html) {
      // Not cached yet: native downloads it, then we read it back
      await this.downloadArticle(url);
      html = await this.cache.getHtml(url);
      if (!html) {
        throw new Error(`Article was downloaded but could not be read: ${url}`);
      }
    }

    const metadata = await this.cache.getMetadata(url);

    return {
      rawHtml: html,
      heroImage: metadata?.heroImage,
      title: metadata?.title,
      byline: metadata?.byline,
      siteName: this.extractSiteName(html),
    };
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

export const articleService = new ArticleService(articleCacheService, (url) =>
  FeedRefreshModule.downloadArticle(url),
);
