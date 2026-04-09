import { ArticlePreloader, PreloadConfig } from "./ArticlePreloader";
import { ArticleService } from "./ArticleService";
import { ArticleCacheService } from "./ArticleCacheService";

const mockArticleService = {
  fetchArticleContent: jest.fn(),
  fetchAndCacheHtml: jest.fn(),
};

const mockArticleCache = {
  has: jest.fn(),
};

const DEFAULT_CONFIG: PreloadConfig = {
  maxConcurrentDownloads: 5,
};

const preloader = new ArticlePreloader(
  mockArticleService as unknown as ArticleService,
  mockArticleCache as unknown as ArticleCacheService,
  DEFAULT_CONFIG,
);

describe("ArticlePreloader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("preloadFeedItems", () => {
    it("should return early if items is undefined", async () => {
      await preloader.preloadFeedItems(undefined);
      expect(mockArticleCache.has).not.toHaveBeenCalled();
    });

    it("should return early if items is empty array", async () => {
      await preloader.preloadFeedItems([]);
      expect(mockArticleCache.has).not.toHaveBeenCalled();
    });

    it("should return early if all items are already cached", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "https://example.com/2", pubDate: "2026-03-28", description: "desc" },
      ];

      mockArticleCache.has.mockResolvedValue(true);

      await preloader.preloadFeedItems(items);

      expect(mockArticleCache.has).toHaveBeenCalledTimes(2);
      expect(mockArticleService.fetchAndCacheHtml).not.toHaveBeenCalled();
    });

    it("should fetch only uncached articles", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "https://example.com/2", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 3", link: "https://example.com/3", pubDate: "2026-03-28", description: "desc" },
      ];

      mockArticleCache.has
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await preloader.preloadFeedItems(items);

      expect(mockArticleCache.has).toHaveBeenCalledTimes(3);
      expect(mockArticleService.fetchAndCacheHtml).toHaveBeenCalledTimes(2);
      expect(mockArticleService.fetchAndCacheHtml).toHaveBeenCalledWith(
        "https://example.com/2",
      );
      expect(mockArticleService.fetchAndCacheHtml).toHaveBeenCalledWith(
        "https://example.com/3",
      );
    });

    it("should filter out empty links", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "", pubDate: "2026-03-28", description: "desc" },
      ] as any;

      mockArticleCache.has.mockResolvedValue(false);

      await preloader.preloadFeedItems(items);

      expect(mockArticleCache.has).toHaveBeenCalledTimes(1);
      expect(mockArticleCache.has).toHaveBeenCalledWith(
        "https://example.com/1",
      );
    });

    it("should call onProgress callback", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "https://example.com/2", pubDate: "2026-03-28", description: "desc" },
      ];

      mockArticleCache.has.mockResolvedValue(false);
      mockArticleService.fetchAndCacheHtml.mockResolvedValue("");
      const onProgress = jest.fn();

      await preloader.preloadFeedItems(items, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });
  });
});