import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Article } from "~/types";

export class ArticleService {
  getArticle = async (url: string): Promise<Article> => {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Failed to fetch article from ${url}: ${res.status} ${res.statusText}`);
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
}

export const articleService = new ArticleService();
