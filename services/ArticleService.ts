import { articleCacheService } from "./ArticleCacheService";
import type { ArticleHtmlCacheEntry } from "~/types";

export type ArticleData = {
  rawHtml: string;
  heroImage?: string;
  title?: string;
  byline?: string;
  siteName?: string;
};

export class ArticleService {
  // Get article data - raw HTML (stripped) + metadata from cache
  getArticle = async (url: string): Promise<ArticleData> => {
    // Try cache first
    let html = await articleCacheService.getHtml(url);

    if (!html) {
      html = await this.fetchHtml(url);
      await articleCacheService.setHtml(url, html);
    }

    const metadata = await articleCacheService.getMetadata(url);

    return {
      rawHtml: this.stripNonContentHtml(html),
      heroImage: metadata?.heroImage,
      title: metadata?.title,
      byline: metadata?.byline,
      siteName: this.extractSiteName(html),
    };
  };

  // Preload: fetch and save metadata only (for feed list)
  fetchArticleContent = async (url: string): Promise<void> => {
    const hasCache = await articleCacheService.has(url);
    if (hasCache) return;

    const html = await this.fetchHtml(url);
    try {
      await articleCacheService.setHtml(url, html);
    } catch {}
  };

  // Legacy - same as fetchArticleContent
  fetchAndCacheHtml = async (url: string): Promise<string> => {
    await this.fetchArticleContent(url);
    return "";
  };

  private fetchHtml = async (url: string): Promise<string> => {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `Failed to fetch article from ${url}: ${res.status} ${res.statusText}`,
      );
    }

    return res.text();
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

  // Strip non-content HTML before sending to WebView to reduce size
  private stripNonContentHtml(html: string): string {
    let result = html
      .replace(/<script[^>]*>(?:[^<]|<(?!\/script>))*<\/script>/gi, "")
      .replace(/<style[^>]*>(?:[^<]|<(?!\/style>))*<\/style>/gi, "")
      .replace(/<noscript[^>]*>(?:[^<]|<(?!\/noscript>))*<\/noscript>/gi, "")
      .replace(/<svg[^>]*>(?:[^<]|<(?!\/svg>))*<\/svg>/gi, "")
      .replace(/<header[^>]*>(?:[^<]|<(?!\/header>))*<\/header>/gi, "")
      .replace(/<footer[^>]*>(?:[^<]|<(?!\/footer>))*<\/footer>/gi, "")
      .replace(/<nav[^>]*>(?:[^<]|<(?!\/nav>))*<\/nav>/gi, "")
      .replace(/<form[^>]*>(?:[^<]|<(?!\/form>))*<\/form>/gi, "");

    result = result
      .replace(/<link[^>]*>/gi, "")
      .replace(/<input[^>]*>/gi, "")
      .replace(/<!--(?:[^-]|-(?!->))*-->/g, "");

    result = result
      .replace(/\s+class="[^"]*"/gi, "")
      .replace(/\s+class='[^']*'/gi, "")
      .replace(/\s+style="[^"]*"/gi, "")
      .replace(/\s+data-(?!src|td-src)[a-z-]+="[^"]*"/gi, "");

    return result;
  }
}

export const articleService = new ArticleService();
