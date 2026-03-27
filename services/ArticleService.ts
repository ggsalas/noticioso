import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { articleCacheService } from "./ArticleCacheService";
import type { Article } from "~/types";

export class ArticleService {
  getArticle = async (url: string): Promise<Article> => {
    // 1. Try cache first (returns null on miss, article on hit with LRU update)
    const cached = await articleCacheService.get(url);
    if (cached) return cached;

    // 2. Fetch and parse only on cache miss
    const article = await this.fetchAndParseArticle(url);

    // 3. Store in cache (set handles removal if needed)
    await articleCacheService.set(url, article);

    return article;
  };

  private fetchAndParseArticle = async (url: string): Promise<Article> => {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(
          `Failed to fetch article from ${url}: ${res.status} ${res.statusText}`,
        );
      }

      const responseText = await res.text();
      const { document } = parseHTML(responseText);

      const article = new Readability(document, {
        nbTopCandidates: 3,
        charThreshold: 1000 * 1000,
      });

      const extractedContent = article.parse();

      const data = {
        ...extractedContent,
        content: this.handleLazyImages(extractedContent?.content),
        heroImage: this.getHeroImage(document, article),
      };

      return data as Article;
    } catch (error) {
      throw new Error(`Error fetching article content: ${error}`);
    }
  };

  // Some pages utilize a placeholder image in the "src" attribute
  // to enable lazy loading of the actual URL.
  // This function updates the "src" with the real URL.
  private handleLazyImages(content?: string): string | undefined {
    if (!content) return content;

    const imageList: { originalHtml: string; newHtml: string }[] = [];
    const { document } = parseHTML(content);

    const populateFixedImages = (selector: string) => {
      const images: NodeListOf<HTMLImageElement> | undefined =
        document.querySelectorAll(`img[${selector}]`);

      images?.forEach((img) => {
        const newImage = document.createElement("img");

        Array.from(img.attributes).forEach((attr) => {
          newImage.setAttribute(attr.name, attr.value);
        });

        newImage.src = img.getAttribute(selector) || img.src;

        imageList.push({
          originalHtml: `${img.outerHTML}`,
          newHtml: newImage.outerHTML,
        });
      });
    };

    populateFixedImages("data-td-src-property"); // used in el observador uruguay
    populateFixedImages("data-src"); // used in many pages

    // Finally, replace with the new images
    imageList.forEach(({ originalHtml, newHtml }) => {
      content = content?.replace(originalHtml, newHtml);
    });

    return content;
  }

  private getHeroImage(doc: Document, parsed: any) {
    // 1. metadata (fast and reliable)
    const meta = extractMetaImage();
    if (meta) return meta;

    // 2. fallback with Readability
    return extractFromReadability();

    // Helper functions
    function isValidImage(url: string): boolean {
      if (!url) return false;

      // avoid data URLs, svg, etc.
      if (url.startsWith("data:")) return false;
      if (url.endsWith(".svg")) return false;

      return true;
    }

    function scoreImage(img: HTMLImageElement): number {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;

      let score = 0;

      // High resolution
      score += width * height;

      // penalize suspicious content
      const src = img.src.toLowerCase();
      if (src.includes("logo")) score *= 0.2;
      if (src.includes("icon")) score *= 0.2;
      if (width < 200 || height < 200) score *= 0.3;

      return score;
    }

    function extractMetaImage(): string | null {
      const og = doc
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");
      if (og && isValidImage(og)) return og;

      const twitter = doc
        .querySelector('meta[name="twitter:image"]')
        ?.getAttribute("content");
      if (twitter && isValidImage(twitter)) return twitter;

      return null;
    }

    function extractFromReadability(): string | null {
      const images = Array.from(
        parsed.querySelectorAll("img"),
      ) as HTMLImageElement[];

      if (!images.length) return null;

      const best = images
        .map((img) => ({
          img,
          score: scoreImage(img),
        }))
        .sort((a, b) => b.score - a.score)[0];

      return best?.img.src || null;
    }
  }
}

export const articleService = new ArticleService();
