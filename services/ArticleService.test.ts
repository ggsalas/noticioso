import { ArticleService } from "./ArticleService";
import { articleCacheService } from "./ArticleCacheService";

jest.mock("./ArticleCacheService", () => ({
  articleCacheService: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe("ArticleService", () => {
  let service: ArticleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArticleService();
  });

  describe("getArticle", () => {
    it("should return cached article on cache hit", async () => {
      const mockArticle = {
        title: "Cached Article",
        content: "<p>Content</p>",
        textContent: "Content",
        length: 100,
        excerpt: "Excerpt",
        byline: "Author",
        dir: "ltr",
        siteName: "Site",
        lang: "en",
        publishedTime: "2026-03-27",
      };
      (articleCacheService.get as jest.Mock).mockResolvedValueOnce(mockArticle);

      const result = await service.getArticle("https://example.com/cached");

      expect(articleCacheService.get).toHaveBeenCalledWith(
        "https://example.com/cached",
      );
      expect(result).toEqual(mockArticle);
    });

    it("should call cache set after fetching on cache miss", async () => {
      (articleCacheService.get as jest.Mock).mockResolvedValueOnce(null);
      (articleCacheService.set as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock fetchAndParseArticle to avoid parsing complexity
      const mockArticle = { title: "Fetched Article", content: "<p>Content</p>" };
      jest.spyOn(service as any, "fetchAndParseArticle").mockResolvedValueOnce(mockArticle);

      await service.getArticle("https://example.com/article");

      expect(articleCacheService.set).toHaveBeenCalledWith(
        "https://example.com/article",
        mockArticle,
      );
    });

    it("should throw error on failed fetch and not cache", async () => {
      (articleCacheService.get as jest.Mock).mockResolvedValueOnce(null);
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        service.getArticle("https://example.com/invalid"),
      ).rejects.toThrow(
        "Failed to fetch article from https://example.com/invalid",
      );

      expect(articleCacheService.set).not.toHaveBeenCalled();
    });

    it("should handle network errors", async () => {
      (articleCacheService.get as jest.Mock).mockResolvedValueOnce(null);
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        service.getArticle("https://example.com/network-error"),
      ).rejects.toThrow("Error fetching article content");
    });
  });
});
