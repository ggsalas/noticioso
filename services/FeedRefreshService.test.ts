import { FeedRefreshService } from "./FeedRefreshService";
import FeedRefreshModule from "@/modules/FeedRefreshModule";
import { feedService } from "./FeedService";
import {
  activeRefreshRepository,
  pendingRefreshRepository,
  lastFetchCompletionRepository,
  refreshRepository,
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
      // Stage 4: GC runs after a successful apply
      expect(mockFeedRefreshModule.collectGarbage).toHaveBeenCalledTimes(1);
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
      expect(mockFeedRefreshModule.collectGarbage).not.toHaveBeenCalled();
    });

    it("should still apply when queuing garbage collection fails", async () => {
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
      mockFeedRefreshModule.collectGarbage.mockRejectedValueOnce(new Error("boom"));
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await service.applyPendingRefresh();
      await Promise.resolve();

      expect(result).toBe(true);
      warn.mockRestore();
    });
  });

  describe("shouldRefresh", () => {
    it("should return true when a stale pending refresh exists (pending does not block)", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockLastFetchCompletionRepository.get.mockResolvedValue(twoHoursAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return false when a pending refresh exists but last fetch is recent", async () => {
      mockPendingRefreshRepository.get.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockLastFetchCompletionRepository.get.mockResolvedValue(tenMinutesAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(false);
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
});
