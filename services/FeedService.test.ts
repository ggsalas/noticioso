import { FeedService } from "./FeedService";
import { StorageService } from "./StorageService";
import { FeedCacheService } from "./FeedCacheService";
import { ArticleCacheService } from "./ArticleCacheService";
import { ArticlePreloader } from "./ArticlePreloader";
import { ArticleRankingService } from "./ArticleRankingService";

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

const mockFeedCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockArticleCache = {
  getHtml: jest.fn(),
  getMetadata: jest.fn(),
  has: jest.fn(),
};

const mockPreloader = {
  preloadForFeed: jest.fn().mockResolvedValue(undefined),
};

let mockFetch: jest.Mock;

beforeAll(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterAll(() => {
  // Clean up global fetch - use any to avoid type issues
  (global as unknown as { fetch?: jest.Mock }).fetch = undefined;
});

// Create a synchronous scheduler for tests that executes immediately
const createTestScheduler = () => {
  let storedTask: (() => Promise<void>) | null = null;
  const scheduler = {
    add: async (task: () => Promise<void>) => {
      storedTask = task;
      await task();
    },
    addMany: async (tasks: (() => Promise<void>)[]) => {
      for (const task of tasks) {
        await task();
      }
    },
    stop: jest.fn(),
    _getStoredTask: () => storedTask,
  };
  return scheduler as unknown as ArticleRankingService;
};

const feedService = new FeedService(
  mockStorage as unknown as StorageService,
  mockFeedCache as unknown as FeedCacheService,
  mockArticleCache as unknown as ArticleCacheService,
  mockPreloader as unknown as ArticlePreloader,
  createTestScheduler(),
);

describe("FeedService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getFeedContent", () => {
    it("should return undefined when no cache exists", async () => {
      mockFeedCache.get.mockResolvedValueOnce(null); // No cache

      const result = await feedService.getFeedContent(
        "https://example.com/rss",
      );

      // Without cache, returns undefined (UI handles empty state)
      expect(result).toBeUndefined();
      // Should NOT trigger network fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return cached data with enhanced items", async () => {
      const cachedFeedData = {
        date: new Date(),
        feedType: "rss" as const,
        rss: {
          channel: {
            title: "Cached Feed",
            item: [
              { title: "Article 1", link: "https://example.com/article1", pubDate: "2026-03-28", description: "desc" },
              { title: "Article 2", link: "https://example.com/article2", pubDate: "2026-03-28", description: "desc" },
            ],
          },
        },
      };

      mockFeedCache.get.mockResolvedValueOnce({ data: cachedFeedData });
      mockArticleCache.getMetadata
        .mockResolvedValueOnce({
          heroImage: "https://example.com/image1.jpg",
          byline: "John Doe",
          title: "Article 1",
          excerpt: "Excerpt 1",
        })
        .mockResolvedValueOnce(null);

      const result = await feedService.getFeedContent("https://example.com/rss");

      expect(result).toBeDefined();
      expect(result?.rss.channel.item[0].heroImage).toBe(
        "https://example.com/image1.jpg",
      );
      expect(result?.rss.channel.item[0].author).toBe("John Doe");
      expect(result?.rss.channel.item[0].excerpt).toBe("Excerpt 1");

      // Second item should not have enhanced metadata
      expect(result?.rss.channel.item[1].heroImage).toBeUndefined();
    });
  });

  describe("getFeeds", () => {
    it("should return feeds from storage", async () => {
      const mockFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];

      mockStorage.getItem.mockResolvedValue(mockFeeds);

      const result = await feedService.getFeeds();

      expect(mockStorage.getItem).toHaveBeenCalledWith("@noticioso-feedList");
      expect(result).toEqual(mockFeeds);
    });

    it("should return empty array when no feeds found", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      const result = await feedService.getFeeds();

      expect(mockStorage.getItem).toHaveBeenCalledWith("@noticioso-feedList");
      expect(result).toEqual([]);
    });
  });

  describe("createOrEditFeed", () => {
    it("should create a new feed", async () => {
      const newFeed = {
        id: "new",
        name: "New Feed",
        url: "https://new.com",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      mockStorage.getItem.mockResolvedValue([]);
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.createOrEditFeed(newFeed);

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [
        newFeed,
      ]);
    });

    it("should throw error for invalid feed", async () => {
      const invalidFeed = {
        id: "invalid",
        name: "",
        url: "https://example.com",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      mockStorage.getItem.mockResolvedValue([]);

      await expect(feedService.createOrEditFeed(invalidFeed)).rejects.toThrow(
        "Feed cannot be added",
      );
    });
  });

  describe("deleteFeed", () => {
    it("should delete existing feed", async () => {
      const existingFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];
      const feedToDelete = existingFeeds[0];

      mockStorage.getItem.mockResolvedValue(existingFeeds);
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.deleteFeed(feedToDelete);

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [
        existingFeeds[1],
      ]);
    });
  });

  describe("importFeeds", () => {
    it("should import valid feeds", async () => {
      const validFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];

      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.importFeeds(JSON.stringify(validFeeds));

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "@noticioso-feedList",
        validFeeds,
      );
    });

    it("should throw error for invalid JSON", async () => {
      await expect(feedService.importFeeds("not valid json")).rejects.toThrow(
        "Invalid JSON format",
      );
    });

    it("should throw error for empty array", async () => {
      await expect(feedService.importFeeds("[]")).rejects.toThrow(
        "Data must be a non-empty array",
      );
    });

    it("should throw error for invalid feed data", async () => {
      const invalidFeeds = [
        {
          id: "1",
          name: "",
          url: "https://example.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
      ];

      await expect(
        feedService.importFeeds(JSON.stringify(invalidFeeds)),
      ).rejects.toThrow("Invalid feed at index 0");
    });

    it("should throw error when oldestArticle is less than 1", async () => {
      const invalidFeeds = [
        {
          id: "1",
          name: "Feed",
          url: "https://example.com",
          oldestArticle: 0 as const,
          lang: "en" as const,
        },
      ];

      await expect(
        feedService.importFeeds(JSON.stringify(invalidFeeds)),
      ).rejects.toThrow("Invalid feed at index 0");
    });
  });
});
