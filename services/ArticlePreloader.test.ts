import { ArticlePreloader, PreloadConfig } from "./ArticlePreloader";
import { ArticleService } from "./ArticleService";
import { ArticleCacheService } from "./ArticleCacheService";

const mockArticleService = {
  fetchArticleContent: jest.fn(),
};

const mockArticleCache = {
  getMetadata: jest.fn(),
};

const DEFAULT_CONFIG: PreloadConfig = {
  totalArticles: 200,
  maxPerFeed: 10,
  activeFeedCount: 1,
  maxConcurrentDownloads: 3,
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

  describe("preloadForFeed", () => {
    it("should return early if items is undefined", async () => {
      await preloader.preloadForFeed(undefined, 1);
      expect(mockArticleCache.getMetadata).not.toHaveBeenCalled();
    });

    it("should return early if items is empty array", async () => {
      await preloader.preloadForFeed([], 1);
      expect(mockArticleCache.getMetadata).not.toHaveBeenCalled();
    });

    it("should return early if all items are already cached", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "https://example.com/2", pubDate: "2026-03-28", description: "desc" },
      ];

      // All items are cached
      mockArticleCache.getMetadata.mockResolvedValue({
        heroImage: "image.jpg",
        byline: "Author",
        title: "Title",
        excerpt: "Excerpt",
      });

      await preloader.preloadForFeed(items, 1);

      // Should have checked cache for all items
      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(2);
      // Should not have fetched any articles
      expect(mockArticleService.fetchArticleContent).not.toHaveBeenCalled();
    });

    it("should fetch only uncached articles", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "https://example.com/2", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 3", link: "https://example.com/3", pubDate: "2026-03-28", description: "desc" },
      ];

      // First is cached, second and third are not
      mockArticleCache.getMetadata
        .mockResolvedValueOnce({
          heroImage: "image.jpg",
          byline: "Author",
          title: "Title",
          excerpt: "Excerpt",
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await preloader.preloadForFeed(items, 1);

      // Should have checked cache for all items
      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(3);
      // Should have fetched only uncached items
      expect(mockArticleService.fetchArticleContent).toHaveBeenCalledTimes(2);
      expect(mockArticleService.fetchArticleContent).toHaveBeenCalledWith(
        "https://example.com/2",
      );
      expect(mockArticleService.fetchArticleContent).toHaveBeenCalledWith(
        "https://example.com/3",
      );
    });

    it("should limit articles per feed based on config", async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        title: `Article ${i}`,
        link: `https://example.com/${i}`,
        pubDate: "2026-03-28",
        description: "desc",
      }));

      // No items cached
      mockArticleCache.getMetadata.mockResolvedValue(null);

      await preloader.preloadForFeed(items, 1);

      // Should check only maxPerFeed (10) items
      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(10);
      expect(mockArticleService.fetchArticleContent).toHaveBeenCalledTimes(10);
    });

    it("should respect feedCount for distribution", async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        title: `Article ${i}`,
        link: `https://example.com/${i}`,
        pubDate: "2026-03-28",
        description: "desc",
      }));

      // No items cached
      mockArticleCache.getMetadata.mockResolvedValue(null);

      // With 2 feeds, should limit to 200/2 = 100 per feed, but capped at maxPerFeed (10)
      await preloader.preloadForFeed(items, 2);

      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(10);
    });

    it("should filter out empty links", async () => {
      const items = [
        { title: "Article 1", link: "https://example.com/1", pubDate: "2026-03-28", description: "desc" },
        { title: "Article 2", link: "", pubDate: "2026-03-28", description: "desc" },
      ] as any;

      mockArticleCache.getMetadata.mockResolvedValue(null);

      await preloader.preloadForFeed(items, 1);

      // Should filter out items with empty links
      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(1);
      expect(mockArticleCache.getMetadata).toHaveBeenCalledWith(
        "https://example.com/1",
      );
    });
  });
});
