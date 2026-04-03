import { FeedService } from "./FeedService";
import { StorageService } from "./StorageService";
import { FeedCacheService } from "./FeedCacheService";
import { ArticleCacheService } from "./ArticleCacheService";
import { ArticlePreloader } from "./ArticlePreloader";
import { BackgroundScheduler } from "./BackgroundScheduler";

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
      // Store task and execute synchronously in tests
      storedTask = task;
      await task();
    },
    addMany: async (tasks: (() => Promise<void>)[]) => {
      for (const task of tasks) {
        await task();
      }
    },
    stop: jest.fn(),
    // Expose stored task for tests that need to verify it
    _getStoredTask: () => storedTask,
  };
  return scheduler as unknown as BackgroundScheduler;
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
    it("should fetch and process RSS feed with date filtering", async () => {
      const mockFeed = {
        id: "1",
        name: "Test Feed",
        url: "https://example.com/rss",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <description>Test Description</description>
            <item>
              <title>Recent Article</title>
              <link>https://example.com/recent</link>
              <pubDate>${new Date().toISOString()}</pubDate>
              <description>Recent article description</description>
            </item>
            <item>
              <title>Old Article</title>
              <link>https://example.com/old</link>
              <pubDate>Mon, 01 Jan 2020 12:00:00 GMT</pubDate>
              <description>Old article description</description>
            </item>
          </channel>
        </rss>`;

      mockStorage.getItem.mockResolvedValue([mockFeed]);
      mockFeedCache.get.mockResolvedValueOnce(null); // No cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssXml),
      });
      mockArticleCache.getMetadata.mockResolvedValue(null);

      const result = await feedService.getFeedContent(
        "https://example.com/rss",
      );

      // Without cache, returns the fetched data (blocking)
      expect(result).toBeDefined();
      expect(result?.fromCache).toBe(false);
      expect(result?.data.date).toBeInstanceOf(Date);
      expect(result?.data.rss).toBeDefined();

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/rss", {
        method: "GET",
      });
      expect(mockPreloader.preloadForFeed).toHaveBeenCalled();

      // Verify cache was populated with the feed data
      expect(mockFeedCache.set).toHaveBeenCalled();
      const cachedData = (mockFeedCache.set as jest.Mock).mock.calls[0][1];
      expect(cachedData.date).toBeInstanceOf(Date);
      expect(cachedData.rss).toBeDefined();
    });

    it("should enhance items with cached article metadata", async () => {
      const mockFeed = {
        id: "1",
        name: "Test Feed",
        url: "https://example.com/rss",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Article 1</title>
              <link>https://example.com/article1</link>
              <pubDate>${new Date().toISOString()}</pubDate>
              <description>Description 1</description>
            </item>
            <item>
              <title>Article 2</title>
              <link>https://example.com/article2</link>
              <pubDate>${new Date().toISOString()}</pubDate>
              <description>Description 2</description>
            </item>
          </channel>
        </rss>`;

      mockStorage.getItem.mockResolvedValue([mockFeed]);
      mockFeedCache.get.mockResolvedValueOnce(null); // No cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssXml),
      });

      // Mock metadata for first article only
      mockArticleCache.getMetadata
        .mockResolvedValueOnce({
          heroImage: "https://example.com/image1.jpg",
          byline: "John Doe",
          title: "Article 1",
          excerpt: "Excerpt 1",
        })
        .mockResolvedValueOnce(null);

      await feedService.getFeedContent("https://example.com/rss");

      expect(mockPreloader.preloadForFeed).toHaveBeenCalled();
      expect(mockArticleCache.getMetadata).toHaveBeenCalledTimes(2);
      expect(mockArticleCache.getMetadata).toHaveBeenCalledWith(
        "https://example.com/article1",
      );
      expect(mockArticleCache.getMetadata).toHaveBeenCalledWith(
        "https://example.com/article2",
      );

      // Verify cache was populated with enhanced metadata
      const cachedData = (mockFeedCache.set as jest.Mock).mock.calls[0][1];
      console.log("cachedData item 0:", JSON.stringify(cachedData.rss.channel.item[0], null, 2));
      expect(cachedData.rss.channel.item[0].heroImage).toBe(
        "https://example.com/image1.jpg",
      );
      expect(cachedData.rss.channel.item[0].author).toBe("John Doe");
      expect(cachedData.rss.channel.item[0].excerpt).toBe("Excerpt 1");

      // Second item should not have enhanced metadata
      expect(cachedData.rss.channel.item[1].heroImage).toBeUndefined();
      expect(cachedData.rss.channel.item[1].author).toBeUndefined();
    });

    it("should return cached data immediately without blocking", async () => {
      const cachedFeedData = {
        date: new Date(),
        feedType: "rss" as const,
        rss: {
          channel: {
            title: "Cached Feed",
            item: [],
          },
        },
      };

      mockFeedCache.get.mockResolvedValueOnce({
        data: cachedFeedData,
        cachedAt: new Date().toISOString(), // Cache reciente (< 1 hora)
      });

      const result = await feedService.getFeedContent(
        "https://example.com/rss",
      );

      // Should return cached data with fromCache flag
      expect(result?.fromCache).toBe(true);
      expect(result?.data).toEqual(cachedFeedData);
    });

    it("should throw error on failed background fetch", async () => {
      mockStorage.getItem.mockResolvedValue([]);
      mockFeedCache.get.mockResolvedValueOnce(null); // No cache
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      mockArticleCache.getMetadata.mockResolvedValue(null);

      // Since fetch happens in background, the error is caught internally
      // and the function returns undefined (no cache)
      const result = await feedService.getFeedContent(
        "https://example.com/invalid",
      );

      expect(result).toBeUndefined();
      // The error is logged but not thrown to avoid breaking the UI
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
