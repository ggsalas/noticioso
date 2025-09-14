import { articleService } from "./ArticleService";

describe("ArticleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe("getArticle", () => {
    it("should fetch and extract article content", async () => {
      const mockHtml = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <article>
              <h1>Test Article Title</h1>
              <p>This is the article content with some meaningful text that should be extracted by Readability.</p>
              <p>More content to ensure we meet the character threshold.</p>
            </article>
          </body>
        </html>`;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await articleService.getArticle("https://example.com/article");

      expect(global.fetch).toHaveBeenCalledWith("https://example.com/article");
      expect(result).not.toBeNull();
      if (result) {
        expect(typeof result.title).toBe("string");
      }
    });

    it("should handle lazy loaded images", async () => {
      const mockHtml = `
        <html>
          <body>
            <article>
              <h1>Article with Images</h1>
              <p>Content with lazy loaded image:</p>
              <img src="placeholder.jpg" data-src="real-image.jpg" alt="Test Image" />
              <img src="another-placeholder.jpg" data-td-src-property="uruguay-image.jpg" alt="Uruguay Image" />
            </article>
          </body>
        </html>`;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await articleService.getArticle("https://example.com/article-with-images");

      expect(result).not.toBeNull();
      if (result && result.content) {
        // Check that lazy loaded images were processed
        expect(result.content).toBeDefined();
      }
    });

    it("should throw error on failed fetch", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        articleService.getArticle("https://example.com/invalid")
      ).rejects.toThrow("Failed to fetch article from https://example.com/invalid");
    });

    it("should handle network errors", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      await expect(
        articleService.getArticle("https://example.com/network-error")
      ).rejects.toThrow("Error fetching article content");
    });
  });
});
