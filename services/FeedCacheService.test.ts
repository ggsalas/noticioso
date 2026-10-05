import { FeedCacheService } from "./FeedCacheService";
import {
  activeRefreshRepository,
  feedSnapshotRepository,
  pendingRefreshRepository,
  lastFetchCompletionRepository,
} from "@/infrastructure";

// Mock infrastructure repositories
jest.mock("@/infrastructure", () => ({
  activeRefreshRepository: {
    get: jest.fn(),
  },
  feedSnapshotRepository: {
    get: jest.fn(),
    set: jest.fn(),
  },
  pendingRefreshRepository: {
    get: jest.fn(),
  },
  lastFetchCompletionRepository: {
    get: jest.fn(),
  },
}));

const mockActiveRefreshRepo = activeRefreshRepository as jest.Mocked<
  typeof activeRefreshRepository
>;
const mockFeedSnapshotRepo = feedSnapshotRepository as jest.Mocked<
  typeof feedSnapshotRepository
>;
const mockPendingRefreshRepo = pendingRefreshRepository as jest.Mocked<
  typeof pendingRefreshRepository
>;
const mockLastFetchCompletionRepo = lastFetchCompletionRepository as jest.Mocked<
  typeof lastFetchCompletionRepository
>;

const feedCacheService = new FeedCacheService();

describe("FeedCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("should return null when no active refresh exists", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(null);

      const result = await feedCacheService.get("https://example.com/feed");

      expect(mockActiveRefreshRepo.get).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should return null when snapshot not found in active refresh", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "refresh-1",
        appliedAt: "2024-01-01T00:00:00Z",
      });
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(null);

      const result = await feedCacheService.get("https://example.com/feed");

      expect(mockActiveRefreshRepo.get).toHaveBeenCalled();
      expect(mockFeedSnapshotRepo.get).toHaveBeenCalledWith(
        "refresh-1",
        "https://example.com/feed"
      );
      expect(result).toBeNull();
    });

    it("should return cached feed data from active refresh", async () => {
      const mockSnapshot = {
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

      mockActiveRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "refresh-1",
        appliedAt: "2024-01-01T00:00:00Z",
      });
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(mockSnapshot);

      const result = await feedCacheService.get("https://example.com/feed");

      expect(result).toEqual({
        data: mockSnapshot.data,
        cachedAt: mockSnapshot.cachedAt,
      });
    });
  });

  describe("set", () => {
    it("should not write when no pending refresh exists", async () => {
      mockPendingRefreshRepo.get.mockResolvedValueOnce(null);

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

      await feedCacheService.set("https://example.com/feed", feedData);

      expect(mockPendingRefreshRepo.get).toHaveBeenCalled();
      expect(mockFeedSnapshotRepo.set).not.toHaveBeenCalled();
    });

    it("should write to pending refresh when one exists", async () => {
      mockPendingRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "pending-refresh-1",
        readyAt: "2024-01-01T00:00:00Z",
      });
      mockFeedSnapshotRepo.set.mockResolvedValue(undefined);

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

      await feedCacheService.set("https://example.com/feed", feedData);

      expect(mockPendingRefreshRepo.get).toHaveBeenCalled();
      expect(mockFeedSnapshotRepo.set).toHaveBeenCalledWith(
        "pending-refresh-1",
        "https://example.com/feed",
        feedData
      );
    });

    it("should not throw if repository fails", async () => {
      mockPendingRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "pending-refresh-1",
        readyAt: "2024-01-01T00:00:00Z",
      });
      mockFeedSnapshotRepo.set.mockRejectedValueOnce(new Error("DB error"));

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

      // Should not throw
      await expect(
        feedCacheService.set("https://example.com/feed", feedData)
      ).resolves.toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should not delete when no pending refresh exists", async () => {
      mockPendingRefreshRepo.get.mockResolvedValueOnce(null);

      await feedCacheService.delete("https://example.com/feed");

      expect(mockPendingRefreshRepo.get).toHaveBeenCalled();
    });

    it("should handle pending refresh existing (currently no-op)", async () => {
      mockPendingRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "pending-refresh-1",
        readyAt: "2024-01-01T00:00:00Z",
      });

      await feedCacheService.delete("https://example.com/feed");

      expect(mockPendingRefreshRepo.get).toHaveBeenCalled();
    });
  });

  describe("getLastFullRefresh", () => {
    it("should return null when no active refresh exists", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(null);

      const result = await feedCacheService.getLastFullRefresh();

      expect(result).toBeNull();
    });

    it("should return applied timestamp from active refresh", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce({
        refreshId: "refresh-1",
        appliedAt: "2024-01-01T00:00:00Z",
      });

      const result = await feedCacheService.getLastFullRefresh();

      expect(result).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("setLastFullRefresh", () => {
    it("should be a no-op (deprecated in Stage 2)", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await feedCacheService.setLastFullRefresh("2024-01-01T00:00:00Z");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("setLastFullRefresh is deprecated")
      );

      consoleSpy.mockRestore();
    });
  });
});
