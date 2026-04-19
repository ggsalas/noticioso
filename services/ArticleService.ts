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
    const t0 = performance.now();
    const cleanedHtml = this.stripNonContentHtml(html);
    console.log(
      `[ArticleService] stripHtml: ${(performance.now() - t0).toFixed(0)}ms (${(html.length / 1024).toFixed(0)}KB -> ${(cleanedHtml.length / 1024).toFixed(0)}KB)`,
    );

    const t1 = performance.now();
    const { document } = parseHTML(cleanedHtml);
    console.log(
      `[ArticleService] parseHTML: ${(performance.now() - t1).toFixed(0)}ms`,
    );

    const t2 = performance.now();
    this.handleLazyImages(document);
    this.simplifyImageMarkup(document);
    console.log(
      `[ArticleService] image fixes: ${(performance.now() - t2).toFixed(0)}ms`,
    );

    const t3 = performance.now();
    const article = new Readability(document, {
      nbTopCandidates: 3,
    });
    const extractedContent = article.parse();
    console.log(
      `[ArticleService] Readability: ${(performance.now() - t3).toFixed(0)}ms`,
    );

    const heroImage = this.extractHeroImage(document);
    console.log(
      `[ArticleService] total: ${(performance.now() - t0).toFixed(0)}ms`,
    );

    const data = {
      ...extractedContent,
      heroImage,
    };

    return data as Article;
  };

  // Strip non-content HTML before parsing to reduce DOM size
  private stripNonContentHtml(html: string): string {
    // Remove tags with content (using [^<] to avoid backtracking)
    let result = html
      .replace(/<script[^>]*>(?:[^<]|<(?!\/script>))*<\/script>/gi, "")
      .replace(/<style[^>]*>(?:[^<]|<(?!\/style>))*<\/style>/gi, "")
      .replace(/<noscript[^>]*>(?:[^<]|<(?!\/noscript>))*<\/noscript>/gi, "")
      .replace(/<svg[^>]*>(?:[^<]|<(?!\/svg>))*<\/svg>/gi, "")
      .replace(/<header[^>]*>(?:[^<]|<(?!\/header>))*<\/header>/gi, "")
      .replace(/<footer[^>]*>(?:[^<]|<(?!\/footer>))*<\/footer>/gi, "")
      .replace(/<nav[^>]*>(?:[^<]|<(?!\/nav>))*<\/nav>/gi, "")
      .replace(/<form[^>]*>(?:[^<]|<(?!\/form>))*<\/form>/gi, "");

    // Remove void/self-closing tags and comments
    result = result
      .replace(/<link[^>]*>/gi, "")
      .replace(/<input[^>]*>/gi, "")
      .replace(/<!--(?:[^-]|-(?!->))*-->/g, "");

    // Strip heavy attributes that bloat the DOM
    result = result
      .replace(/\s+class="[^"]*"/gi, "")
      .replace(/\s+class='[^']*'/gi, "")
      .replace(/\s+style="[^"]*"/gi, "")
      .replace(/\s+data-(?!src|td-src)[a-z-]+="[^"]*"/gi, "");

    return result;
  }

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

  private handleLazyImages(doc: Document): void {
    const fixImages = (selector: string) => {
      const images = doc.querySelectorAll(`img[${selector}]`);
      images?.forEach((img: Element) => {
        const lazySrc = img.getAttribute(selector);
        if (lazySrc) {
          img.setAttribute("src", lazySrc);
        }
      });
    };

    fixImages("data-td-src-property");
    fixImages("data-src");

    // Handle images with loading="lazy" that may have src in srcset/source
    const pictures = doc.querySelectorAll("picture");
    pictures?.forEach((picture: Element) => {
      const img = picture.querySelector("img");
      const source = picture.querySelector("source");
      if (img && source) {
        const srcset = source.getAttribute("srcset");
        if (
          srcset &&
          (!img.getAttribute("src") || img.getAttribute("loading") === "lazy")
        ) {
          const firstSrc = srcset.split(",")[0]?.trim().split(/\s+/)[0];
          if (firstSrc) {
            img.setAttribute("src", firstSrc);
            img.removeAttribute("loading");
          }
        }
      }
    });
  }

  // Simplify nested image markup so Readability doesn't discard images
  // Replaces <picture> with its <img>, and unwraps non-semantic div wrappers
  // around images so the <img> sits directly inside <figure> or content flow.
  private simplifyImageMarkup(doc: Document): void {
    // Replace <picture> elements with their <img> child
    const pictures = doc.querySelectorAll("picture");
    pictures?.forEach((picture: Element) => {
      const img = picture.querySelector("img");
      if (img) {
        picture.parentNode?.replaceChild(img, picture);
      }
    });

    // Unwrap non-semantic divs that only contain an image
    // e.g. <div class="placeholder"><div class="com-image"><img></div></div>
    // becomes just <img> in the parent
    const divs = Array.from(
      doc.querySelectorAll("figure div, section div"),
    ) as Element[];
    // Process deepest divs first so we unwrap from inside out
    divs.reverse().forEach((div: Element) => {
      const children = Array.from(div.children);
      const hasOnlyImageContent =
        children.length === 1 &&
        (children[0].tagName === "IMG" || children[0].tagName === "DIV");
      if (hasOnlyImageContent) {
        div.parentNode?.replaceChild(children[0], div);
      }
    });
  }
}

export const articleService = new ArticleService();
