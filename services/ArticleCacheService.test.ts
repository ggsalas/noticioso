import { ArticleCacheService } from "./ArticleCacheService";
import { StorageService } from "./StorageService";
import type { Article, ArticleCacheEntry } from "~/types";

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

const articleCacheService = new ArticleCacheService(
  mockStorage as unknown as StorageService,
);

const createMockArticle = (overrides: Partial<Article> = {}): Article => ({
  title: "Test Article",
  content: "<p>Test content</p>",
  textContent: "Test content",
  length: 100,
  excerpt: "Test excerpt",
  byline: "Test Author",
  dir: "ltr",
  siteName: "Test Site",
  lang: "en",
  publishedTime: "2026-03-27",
  ...overrides,
});

const createMockEntry = (
  overrides: Partial<ArticleCacheEntry> = {},
): ArticleCacheEntry => {
  const now = new Date().toISOString();
  return {
    article: createMockArticle(),
    cachedAt: now,
    lastAccessedAt: now,
    ...overrides,
  };
};

describe("ArticleCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("should return null for non-existent article", async () => {
      mockStorage.getItem.mockResolvedValueOnce(null);

      const result = await articleCacheService.get(
        "https://example.com/not-found",
      );

      expect(mockStorage.getItem).toHaveBeenCalledWith(
        "@noticioso-articleCache-https://example.com/not-found",
      );
      expect(result).toBeNull();
    });

    it("should return article and update lastAccessedAt on cache hit", async () => {
      const mockEntry = createMockEntry();
      const oldLastAccessed = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
      mockEntry.lastAccessedAt = oldLastAccessed;

      mockStorage.getItem.mockResolvedValueOnce(mockEntry);
      mockStorage.getItem.mockResolvedValueOnce({}); // getIndex returns empty
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await articleCacheService.get(
        "https://example.com/article",
      );

      expect(result).toEqual(mockEntry.article);
      expect(mockStorage.setItem).toHaveBeenCalled(); // update entry
    });
  });

  describe("getMetadata", () => {
    it("should return null for non-existent article", async () => {
      mockStorage.getItem.mockResolvedValueOnce(null);

      const result = await articleCacheService.getMetadata(
        "https://example.com/not-found",
      );

      expect(result).toBeNull();
    });

    it("should extract metadata from cached article", async () => {
      const mockEntry = createMockEntry({
        article: createMockArticle({
          title: "Test Title",
          byline: "Test Byline",
          excerpt: "Test Excerpt",
          heroImage: "https://example.com/image.jpg",
        }),
      });

      mockStorage.getItem.mockResolvedValueOnce(mockEntry);

      const result = await articleCacheService.getMetadata(
        "https://example.com/article",
      );

      expect(result).toEqual({
        title: "Test Title",
        byline: "Test Byline",
        excerpt: "Test Excerpt",
        heroImage: "https://example.com/image.jpg",
      });
    });

    it("should handle missing optional fields", async () => {
      const mockEntry = createMockEntry({
        article: createMockArticle({
          title: "",
          byline: "",
          excerpt: "",
          heroImage: undefined,
        }),
      });

      mockStorage.getItem.mockResolvedValueOnce(mockEntry);

      const result = await articleCacheService.getMetadata(
        "https://example.com/article",
      );

      expect(result).toEqual({
        title: "",
        byline: "",
        excerpt: "",
        heroImage: undefined,
      });
    });
  });

  describe("set", () => {
    it("should save article and update index when under limit", async () => {
      mockStorage.getItem.mockResolvedValueOnce({}); // getIndex returns empty
      mockStorage.setItem.mockResolvedValue(undefined);

      const article = createMockArticle({ title: "New Article" });
      await articleCacheService.set("https://example.com/new", article);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "@noticioso-articleCache-https://example.com/new",
        expect.objectContaining({
          article: article,
          cachedAt: expect.any(String),
          lastAccessedAt: expect.any(String),
        }),
      );
    });

    it("should call removeOldest when at limit", async () => {
      // Create 300 entries to reach the limit
      const index: Record<string, { cachedAt: string; lastAccessedAt: string }> = {};
      for (let i = 0; i < 300; i++) {
        const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        index[`https://example.com/old-${i}`] = {
          cachedAt: oldDate,
          lastAccessedAt: oldDate,
        };
      }

      mockStorage.getItem.mockResolvedValue(index);
      const removeOldestSpy = jest.spyOn(articleCacheService as any, "removeOldest");

      const article = createMockArticle({ title: "New Article" });
      await articleCacheService.set("https://example.com/new", article);

      expect(removeOldestSpy).toHaveBeenCalled();
    });
  });

  describe("removal priority", () => {
    it("should prefer deleting never-read old articles over LRU", async () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const fiveDaysAgo = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const index = {
        "https://example.com/old-never-read": {
          cachedAt: tenDaysAgo,
          lastAccessedAt: tenDaysAgo, // Never opened
        },
        "https://example.com/old-read": {
          cachedAt: tenDaysAgo,
          lastAccessedAt: fiveDaysAgo, // Was opened
        },
      };

      // getIndex for removeOldest
      // getIndex for removeFromIndex (inside delete)
      mockStorage.getItem
        .mockResolvedValueOnce(index)
        .mockResolvedValueOnce(index);
      mockStorage.removeItem.mockResolvedValue(undefined);
      mockStorage.setItem.mockResolvedValue(undefined);

      // Call removeOldest directly
      await (articleCacheService as any).removeOldest();

      // Should remove the never-read article (priority 1)
      expect(mockStorage.removeItem).toHaveBeenCalledWith(
        "@noticioso-articleCache-https://example.com/old-never-read",
      );
    });

    it("should fallback to LRU when all old articles were read", async () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const fiveDaysAgo = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const index = {
        "https://example.com/old-read-1": {
          cachedAt: tenDaysAgo,
          lastAccessedAt: fiveDaysAgo, // Was opened
        },
        "https://example.com/old-read-2": {
          cachedAt: tenDaysAgo,
          lastAccessedAt: tenDaysAgo, // Opened earlier
        },
      };

      // getIndex for removeOldest
      // getIndex for removeFromIndex (inside delete)
      mockStorage.getItem
        .mockResolvedValueOnce(index)
        .mockResolvedValueOnce(index);
      mockStorage.removeItem.mockResolvedValue(undefined);
      mockStorage.setItem.mockResolvedValue(undefined);

      // Call removeOldest directly
      await (articleCacheService as any).removeOldest();

      // Should remove the older-read article (LRU - oldest lastAccessedAt)
      expect(mockStorage.removeItem).toHaveBeenCalledWith(
        "@noticioso-articleCache-https://example.com/old-read-2",
      );
    });
  });
});
