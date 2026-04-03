import { ArticleService } from "./ArticleService";
import { articleCacheService } from "./ArticleCacheService";

describe("ArticleService", () => {
  let service: ArticleService;
  let mockSetHtml: jest.SpyInstance;
  let mockHas: jest.SpyInstance;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArticleService();

    mockSetHtml = jest.spyOn(articleCacheService, "setHtml");
    mockHas = jest.spyOn(articleCacheService, "has");
    mockFetch = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    mockSetHtml.mockRestore();
    mockHas.mockRestore();
    mockFetch.mockRestore();
  });

  describe("getArticle", () => {
    it("should fetch, save metadata, and parse article", async () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:title" content="Test Article">
          </head>
          <body>
            <article>Content</article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });
      mockSetHtml.mockResolvedValueOnce(undefined);

      const result = await service.getArticle("https://example.com/article");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/article");
      expect(mockSetHtml).toHaveBeenCalledWith(
        "https://example.com/article",
        mockHtml,
      );
      expect(result).toBeDefined();
      expect(result.title).toBe("Test Article");
    });

    it("should throw error on failed fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        service.getArticle("https://example.com/invalid"),
      ).rejects.toThrow(
        "Failed to fetch article from https://example.com/invalid",
      );
    });
  });

  describe("fetchArticleContent", () => {
    it("should return early if already cached", async () => {
      mockHas.mockResolvedValueOnce(true);

      await service.fetchArticleContent("https://example.com/cached");

      expect(mockHas).toHaveBeenCalledWith("https://example.com/cached");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should fetch and save metadata on cache miss", async () => {
      mockHas.mockResolvedValueOnce(false);

      const mockHtml = "<html><head></head><body>Content</body></html>";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });
      mockSetHtml.mockResolvedValueOnce(undefined);

      await service.fetchArticleContent("https://example.com/new");

      expect(mockHas).toHaveBeenCalledWith("https://example.com/new");
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/new");
      expect(mockSetHtml).toHaveBeenCalledWith(
        "https://example.com/new",
        mockHtml,
      );
    });
  });
});