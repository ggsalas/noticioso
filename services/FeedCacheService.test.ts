import { FeedCacheService } from "./FeedCacheService";
import { FeedCacheRepository } from "../infrastructure/FeedCacheRepository";
import { LastRefreshRepository } from "../infrastructure/LastRefreshRepository";

const mockFeedCacheRepo = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockLastRefreshRepo = {
  get: jest.fn(),
  set: jest.fn(),
};

const feedCacheService = new FeedCacheService(
  mockFeedCacheRepo as unknown as FeedCacheRepository,
  mockLastRefreshRepo as unknown as LastRefreshRepository
);

describe("FeedCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("should return null when feed not in cache", async () => {
      mockFeedCacheRepo.get.mockResolvedValueOnce(null);

      const result = await feedCacheService.get("https://example.com/feed");

      expect(mockFeedCacheRepo.get).toHaveBeenCalledWith("https://example.com/feed");
      expect(result).toBeNull();
    });

    it("should return cached feed data", async () => {
      const mockCache = {
        data: {
          feedType: "rss" as const,
          date: new Date(),
          rss: {
            channel: {
              title: "Test Feed",
              description: "Test Description",
              language: "en",
              link: "http://example.com",
              lastBuildDate: "2024-01-01T00:00:00Z",
              item: [],
            },
          },
        },
        cachedAt: "2024-01-01T00:00:00Z",
      };
      mockFeedCacheRepo.get.mockResolvedValueOnce(mockCache);

      const result = await feedCacheService.get("https://example.com/feed");

      expect(result).toEqual(mockCache);
    });
  });

  describe("set", () => {
    it("should save feed to repository", async () => {
      const feedData = {
        feedType: "rss" as const,
        date: new Date(),
        rss: {
          channel: {
            title: "Test Feed",
            description: "Test Description",
            language: "en",
            link: "http://example.com",
            lastBuildDate: "2024-01-01T00:00:00Z",
            item: [],
          },
        },
      };
      mockFeedCacheRepo.set.mockResolvedValue(undefined);

      await feedCacheService.set("https://example.com/feed", feedData);

      expect(mockFeedCacheRepo.set).toHaveBeenCalledWith(
        "https://example.com/feed",
        feedData
      );
    });

    it("should not throw if repository fails", async () => {
      const feedData = {
        feedType: "rss" as const,
        date: new Date(),
        rss: {
          channel: {
            title: "Test Feed",
            description: "Test Description",
            language: "en",
            link: "http://example.com",
            lastBuildDate: "2024-01-01T00:00:00Z",
            item: [],
          },
        },
      };
      mockFeedCacheRepo.set.mockRejectedValueOnce(new Error("DB error"));

      // Should not throw
      await expect(feedCacheService.set("https://example.com/feed", feedData)).resolves.toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should delete feed from repository", async () => {
      mockFeedCacheRepo.delete.mockResolvedValue(undefined);

      await feedCacheService.delete("https://example.com/feed");

      expect(mockFeedCacheRepo.delete).toHaveBeenCalledWith("https://example.com/feed");
    });
  });

  describe("getLastFullRefresh", () => {
    it("should return null when no timestamp", async () => {
      mockLastRefreshRepo.get.mockResolvedValueOnce(null);

      const result = await feedCacheService.getLastFullRefresh();

      expect(result).toBeNull();
    });

    it("should return last refresh timestamp", async () => {
      mockLastRefreshRepo.get.mockResolvedValueOnce("2024-01-01T00:00:00Z");

      const result = await feedCacheService.getLastFullRefresh();

      expect(result).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("setLastFullRefresh", () => {
    it("should save timestamp to repository", async () => {
      mockLastRefreshRepo.set.mockResolvedValue(undefined);

      await feedCacheService.setLastFullRefresh("2024-01-01T00:00:00Z");

      expect(mockLastRefreshRepo.set).toHaveBeenCalledWith("2024-01-01T00:00:00Z");
    });
  });
});
