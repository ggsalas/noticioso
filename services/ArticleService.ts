import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { articleCacheService } from "./ArticleCacheService";
import type { Article } from "~/types";

export class ArticleService {
  // Get article - use cache if available, otherwise fetch and save
  getArticle = async (url: string): Promise<Article> => {
    // Try cache first
    const cachedHtml = await articleCacheService.getHtml(url);

    if (cachedHtml) {
      return this.parseArticleFromHtml(cachedHtml);
    }

    // Fetch, save to cache, and parse
    const html = await this.fetchHtml(url);
    await articleCacheService.setHtml(url, html);
    return this.parseArticleFromHtml(html);
  };

  // Preload: fetch and save metadata only (for feed list)
  fetchArticleContent = async (url: string): Promise<void> => {
    const hasCache = await articleCacheService.has(url);
    if (hasCache) return;

    // Fetch HTML and save (full HTML to file system, metadata to AsyncStorage)
    const html = await this.fetchHtml(url);
    try {
      await articleCacheService.setHtml(url, html);
    } catch {}
  };

  // Legacy - same as fetchArticleContent
  fetchAndCacheHtml = async (url: string): Promise<string> => {
    await this.fetchArticleContent(url);
    // Return empty since we don't return HTML anymore
    return "";
  };

  // Just fetch HTML
  private fetchHtml = async (url: string): Promise<string> => {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `Failed to fetch article from ${url}: ${res.status} ${res.statusText}`,
      );
    }

    return res.text();
  };

  // Parse HTML into Article
  private parseArticleFromHtml = (html: string): Article => {
    const { document } = parseHTML(html);

    const article = new Readability(document, {
      nbTopCandidates: 3,
      charThreshold: 5000,
    });

    const extractedContent = article.parse();
    const contentWithFixedImages = this.handleLazyImages(
      extractedContent?.content,
    );
    const heroImage = this.extractHeroImage(document);

    const data = {
      ...extractedContent,
      content: contentWithFixedImages,
      heroImage,
    };

    return data as Article;
  };

  private extractHeroImage(doc: Document): string | undefined {
    const ogImage = doc
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content");
    if (ogImage && this.isValidImage(ogImage)) return ogImage;

    const twitterImage = doc
      .querySelector('meta[name="twitter:image"]')
      ?.getAttribute("content");
    if (twitterImage && this.isValidImage(twitterImage)) return twitterImage;

    return this.findBestImageFromBody(doc);
  }

  private isValidImage(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("data:")) return false;
    if (url.endsWith(".svg")) return false;
    return true;
  }

  private findBestImageFromBody(doc: Document): string | undefined {
    const images = Array.from(
      doc.querySelectorAll("img") as unknown as HTMLImageElement[],
    );
    if (!images.length) return undefined;

    const scored = images
      .map((img: HTMLImageElement) => {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        const score = width * height;
        const src = img.src.toLowerCase();
        if (src.includes("logo")) return { img, score: score * 0.2 };
        if (src.includes("icon")) return { img, score: score * 0.2 };
        if (width < 200 || height < 200) return { img, score: score * 0.3 };
        return { img, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.img?.src;
  }

  private handleLazyImages(content?: string): string | undefined {
    if (!content) return content;

    const imageList: { originalHtml: string; newHtml: string }[] = [];
    const { document } = parseHTML(content);

    const populateFixedImages = (selector: string) => {
      const images = document.querySelectorAll(`img[${selector}]`);
      images?.forEach((img: Element) => {
        const newImage = document.createElement("img");
        Array.from(img.attributes).forEach((attr) => {
          newImage.setAttribute(attr.name, attr.value);
        });
        newImage.setAttribute("src", img.getAttribute(selector) || "");
        imageList.push({
          originalHtml: img.outerHTML,
          newHtml: newImage.outerHTML,
        });
      });
    };

    populateFixedImages("data-td-src-property");
    populateFixedImages("data-src");

    imageList.forEach(({ originalHtml, newHtml }) => {
      content = content?.replace(originalHtml, newHtml);
    });

    return content;
  }
}

export const articleService = new ArticleService();
