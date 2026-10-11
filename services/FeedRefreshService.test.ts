import { FeedRefreshService } from "./FeedRefreshService";
import FeedRefreshModule from "@/modules/FeedRefreshModule";
import { feedService } from "./FeedService";
import {
  activeRefreshRepository,
  pendingRefreshRepository,
  lastFetchCompletionRepository,
  refreshRepository,
  feedSnapshotRepository,
  getDatabase,
} from "@/infrastructure";

// Mock dependencies
jest.mock("@/modules/FeedRefreshModule");
jest.mock("./FeedService");
jest.mock("@/infrastructure");

const mockFeedRefreshModule = FeedRefreshModule as jest.Mocked<
  typeof FeedRefreshModule
>;
const mockFeedService = feedService as jest.Mocked<typeof feedService>;
const mockActiveRefreshRepository =
  activeRefreshRepository as jest.Mocked<typeof activeRefreshRepository>;
const mockPendingRefreshRepository =
  pendingRefreshRepository as jest.Mocked<typeof pendingRefreshRepository>;
const mockLastFetchCompletionRepository =
  lastFetchCompletionRepository as jest.Mocked<
    typeof lastFetchCompletionRepository
  >;
const mockRefreshRepository =
  refreshRepository as jest.Mocked<typeof refreshRepository>;
const mockFeedSnapshotRepository =
  feedSnapshotRepository as jest.Mocked<typeof feedSnapshotRepository>;
const mockGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe("FeedRefreshService", () => {
  let service: FeedRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database with transaction support
    const mockDb = {
      withTransactionAsync: jest.fn().mockImplementation(async (callback) => {
        await callback();
      }),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    mockGetDatabase.mockResolvedValue(mockDb as any);

    service = new FeedRefreshService();
  });

  describe("refreshAllFeeds", () => {
    it("should call native module with feeds", async () => {
      const mockFeeds = [
        {
          id: "1",
          name: "Test Feed",
          url: "https://example.com/rss",
          oldestArticle: 7 as const,
          lang: "en" as const,
        },
      ];
      mockFeedService.getFeeds.mockResolvedValue(mockFeeds);
      mockFeedRefreshModule.refreshFeeds.mockResolvedValue(
        "1 feeds downloaded successfully, 0 failed"
      );

      const result = await service.refreshAllFeeds();

      expect(mockFeedRefreshModule.refreshFeeds).toHaveBeenCalledWith([
        {
          id: "1",
          name: "Test Feed",
          url: "https://example.com/rss",
          oldestArticle: 7,
          lang: "en",
        },
      ]);
      expect(result).toBe("1 feeds downloaded successfully, 0 failed");
    });

    it("should return message when no feeds configured", async () => {
      mockFeedService.getFeeds.mockResolvedValue([]);

      const result = await service.refreshAllFeeds();

      expect(result).toBe("No feeds configured");
      expect(mockFeedRefreshModule.refreshFeeds).not.toHaveBeenCalled();
    });

    it("should handle undefined feeds", async () => {
      mockFeedService.getFeeds.mockResolvedValue(undefined);

      const result = await service.refreshAllFeeds();

      expect(result).toBe("No feeds configured");
      expect(mockFeedRefreshModule.refreshFeeds).not.toHaveBeenCalled();
    });
  });

  describe("hasPendingRefresh", () => {
    it("should return true when pending refresh exists", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.hasPendingRefresh();

      expect(result).toBe(true);
    });

    it("should return false when no pending refresh", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue(null);

      const result = await service.hasPendingRefresh();

      expect(result).toBe(false);
    });
  });

  describe("applyPendingRefresh", () => {
    it("should apply pending refresh and mark old active as superseded", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-new",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      mockRefreshRepository.get.mockResolvedValue({
        id: "refresh-new",
        state: "ready",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        appliedAt: null,
        supersededAt: null,
      });
      mockActiveRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-old",
        appliedAt: "2025-12-31T00:00:00.000Z",
      });

      const result = await service.applyPendingRefresh();

      expect(mockRefreshRepository.markSuperseded).toHaveBeenCalledWith(
        "refresh-old"
      );
      expect(mockActiveRefreshRepository.set).toHaveBeenCalledWith(
        "refresh-new"
      );
      expect(mockRefreshRepository.markApplied).toHaveBeenCalledWith(
        "refresh-new"
      );
      expect(mockPendingRefreshRepository.clear).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should apply pending refresh when no active exists", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      mockRefreshRepository.get.mockResolvedValue({
        id: "refresh-123",
        state: "ready",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        appliedAt: null,
        supersededAt: null,
      });
      mockActiveRefreshRepository.get.mockResolvedValue(null);

      const result = await service.applyPendingRefresh();

      expect(mockRefreshRepository.markSuperseded).not.toHaveBeenCalled();
      expect(mockActiveRefreshRepository.set).toHaveBeenCalledWith(
        "refresh-123"
      );
      expect(mockRefreshRepository.markApplied).toHaveBeenCalledWith(
        "refresh-123"
      );
      expect(mockPendingRefreshRepository.clear).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should return false when no pending refresh", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue(null);

      const result = await service.applyPendingRefresh();

      expect(result).toBe(false);
      expect(mockActiveRefreshRepository.set).not.toHaveBeenCalled();
      expect(mockRefreshRepository.markApplied).not.toHaveBeenCalled();
      expect(mockPendingRefreshRepository.clear).not.toHaveBeenCalled();
    });
  });

  describe("shouldRefresh", () => {
    it("should return false when pending refresh exists", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.shouldRefresh();

      expect(result).toBe(false);
      expect(mockLastFetchCompletionRepository.get).not.toHaveBeenCalled();
    });

    it("should return true when no pending and never fetched", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue(null);
      mockLastFetchCompletionRepository.get.mockResolvedValue(null);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return true when last fetch is older than 1 hour", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue(null);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockLastFetchCompletionRepository.get.mockResolvedValue(twoHoursAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return false when last fetch is less than 1 hour ago", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue(null);
      const thirtyMinutesAgo = new Date(
        Date.now() - 30 * 60 * 1000
      ).toISOString();
      mockLastFetchCompletionRepository.get.mockResolvedValue(
        thirtyMinutesAgo
      );

      const result = await service.shouldRefresh();

      expect(result).toBe(false);
    });
  });

  describe("getLastFetchCompletion", () => {
    it("should return last fetch completion timestamp", async () => {
      const timestamp = "2026-01-01T00:00:00.000Z";
      mockLastFetchCompletionRepository.get.mockResolvedValue(timestamp);

      const result = await service.getLastFetchCompletion();

      expect(result).toBe(timestamp);
    });

    it("should return null when no last fetch", async () => {
      mockLastFetchCompletionRepository.get.mockResolvedValue(null);

      const result = await service.getLastFetchCompletion();

      expect(result).toBeNull();
    });
  });

  describe("getFeedData", () => {
    it("should return feed data from active refresh", async () => {
      const mockFeedData = {
        date: new Date(),
        feedType: "rss" as const,
        rss: {
          channel: {
            title: "Test Feed",
            description: "Test Description",
            language: "en",
            link: "https://example.com",
            lastBuildDate: "2026-01-01T00:00:00.000Z",
            item: [],
          },
        },
      };

      mockActiveRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        appliedAt: "2026-01-01T00:00:00.000Z",
      });
      mockFeedSnapshotRepository.get.mockResolvedValue({
        data: mockFeedData,
        cachedAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.getFeedData("https://example.com/rss");

      expect(result).toEqual(mockFeedData);
      expect(mockFeedSnapshotRepository.get).toHaveBeenCalledWith(
        "refresh-123",
        "https://example.com/rss"
      );
    });

    it("should return null when no active refresh", async () => {
      mockActiveRefreshRepository.get.mockResolvedValue(null);

      const result = await service.getFeedData("https://example.com/rss");

      expect(result).toBeNull();
      expect(mockFeedSnapshotRepository.get).not.toHaveBeenCalled();
    });

    it("should return null when snapshot not found", async () => {
      mockActiveRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        appliedAt: "2026-01-01T00:00:00.000Z",
      });
      mockFeedSnapshotRepository.get.mockResolvedValue(null);

      const result = await service.getFeedData("https://example.com/rss");

      expect(result).toBeNull();
    });
  });
});
