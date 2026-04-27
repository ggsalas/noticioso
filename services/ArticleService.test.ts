import { ArticleService } from "./ArticleService";
import { articleCacheService } from "./ArticleCacheService";

describe("ArticleService", () => {
  let service: ArticleService;
  let mockSetHtml: jest.SpyInstance;
  let mockGetHtml: jest.SpyInstance;
  let mockGetMetadata: jest.SpyInstance;
  let mockHas: jest.SpyInstance;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArticleService();

    mockSetHtml = jest.spyOn(articleCacheService, "setHtml");
    mockGetHtml = jest.spyOn(articleCacheService, "getHtml");
    mockGetMetadata = jest.spyOn(articleCacheService, "getMetadata");
    mockHas = jest.spyOn(articleCacheService, "has");
    mockFetch = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    mockSetHtml.mockRestore();
    mockGetHtml.mockRestore();
    mockGetMetadata.mockRestore();
    mockHas.mockRestore();
    mockFetch.mockRestore();
  });

  describe("getArticle", () => {
    it("should fetch, cache, and return article data with metadata", async () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:title" content="Test Article">
            <meta property="og:image" content="https://example.com/image.jpg">
            <meta property="og:site_name" content="Example Site">
          </head>
          <body>
            <article>Content</article>
          </body>
        </html>
      `;

      mockGetHtml.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });
      mockSetHtml.mockResolvedValueOnce(undefined);
      mockGetMetadata.mockResolvedValueOnce({
        title: "Test Article",
        heroImage: "https://example.com/image.jpg",
        byline: "",
        excerpt: "",
      });

      const result = await service.getArticle("https://example.com/article");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/article");
      expect(mockSetHtml).toHaveBeenCalledWith(
        "https://example.com/article",
        mockHtml,
      );
      expect(result).toBeDefined();
      expect(result.title).toBe("Test Article");
      expect(result.heroImage).toBe("https://example.com/image.jpg");
      expect(result.siteName).toBe("Example Site");
      expect(result.rawHtml).toBeDefined();
    });

    it("should use cached HTML when available", async () => {
      const mockHtml = `<html><head><meta property="og:site_name" content="Cached"></head><body>Cached</body></html>`;

      mockGetHtml.mockResolvedValueOnce(mockHtml);
      mockGetMetadata.mockResolvedValueOnce({
        title: "Cached Article",
        heroImage: undefined,
        byline: "",
        excerpt: "",
      });

      const result = await service.getArticle("https://example.com/cached");

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.title).toBe("Cached Article");
    });

    it("should throw error on failed fetch", async () => {
      mockGetHtml.mockResolvedValueOnce(null);
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

    it("should fetch and save on cache miss", async () => {
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
