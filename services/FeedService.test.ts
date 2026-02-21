import { FeedService } from "./FeedService";
import { StorageService } from "./StorageService";

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const feedService = new FeedService(mockStorage as unknown as StorageService);

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockRssXml),
      });

      const result = await feedService.getFeedContent("https://example.com/rss");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/rss", { method: "GET" });
      expect(result.date).toBeInstanceOf(Date);
      expect(result.rss).toBeDefined();
    });

    it("should throw error on failed fetch", async () => {
      mockStorage.getItem.mockResolvedValue([]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        feedService.getFeedContent("https://example.com/invalid")
      ).rejects.toThrow("Failed to fetch feed from https://example.com/invalid");
    });
  });

  describe("getFeeds", () => {
    it("should return feeds from storage", async () => {
      const mockFeeds = [
        { id: "1", name: "Feed 1", url: "https://example1.com", oldestArticle: 1 as const, lang: "en" as const },
        { id: "2", name: "Feed 2", url: "https://example2.com", oldestArticle: 7 as const, lang: "es" as const },
      ];

      mockStorage.getItem.mockResolvedValue(mockFeeds);

      const result = await feedService.getFeeds();

      expect(mockStorage.getItem).toHaveBeenCalledWith("@noticioso-feedList");
      expect(result).toEqual(mockFeeds);
    });

    it("should throw error when no feeds found", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      await expect(feedService.getFeeds()).rejects.toThrow("No feeds found");
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
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [newFeed]);
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

      await expect(feedService.createOrEditFeed(invalidFeed)).rejects.toThrow("Feed cannot be added");
    });
  });

  describe("deleteFeed", () => {
    it("should delete existing feed", async () => {
      const existingFeeds = [
        { id: "1", name: "Feed 1", url: "https://example1.com", oldestArticle: 1 as const, lang: "en" as const },
        { id: "2", name: "Feed 2", url: "https://example2.com", oldestArticle: 7 as const, lang: "es" as const },
      ];
      const feedToDelete = existingFeeds[0];

      mockStorage.getItem.mockResolvedValue(existingFeeds);
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.deleteFeed(feedToDelete);

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [existingFeeds[1]]);
    });
  });
});
