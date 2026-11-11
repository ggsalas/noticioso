import { FeedRefreshService } from "./FeedRefreshService";
import FeedRefreshModule from "@/modules/FeedRefreshModule";
import { feedService } from "./FeedService";
import { refreshRepository } from "@/db";

// Mock dependencies
jest.mock("@/modules/FeedRefreshModule");
jest.mock("./FeedService");
jest.mock("@/db");

const mockFeedRefreshModule = FeedRefreshModule as jest.Mocked<
  typeof FeedRefreshModule
>;
const mockFeedService = feedService as jest.Mocked<typeof feedService>;
const mockRefreshRepository = refreshRepository as jest.Mocked<typeof refreshRepository>;

describe("FeedRefreshService", () => {
  let service: FeedRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();

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
      mockRefreshRepository.getPending.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.hasPendingRefresh();

      expect(result).toBe(true);
    });

    it("should return false when no pending refresh", async () => {
      mockRefreshRepository.getPending.mockResolvedValue(null);

      const result = await service.hasPendingRefresh();

      expect(result).toBe(false);
    });
  });

  describe("applyPendingRefresh", () => {
    it("delegates to the native module and returns whether a generation was applied", async () => {
      mockFeedRefreshModule.applyPendingRefresh.mockResolvedValueOnce(true);
      expect(await service.applyPendingRefresh()).toBe(true);

      mockFeedRefreshModule.applyPendingRefresh.mockResolvedValueOnce(false);
      expect(await service.applyPendingRefresh()).toBe(false);

      expect(mockFeedRefreshModule.applyPendingRefresh).toHaveBeenCalledTimes(2);
    });
  });

  describe("shouldRefresh", () => {
    it("should return true when a stale pending refresh exists (pending does not block)", async () => {
      mockRefreshRepository.getPending.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockRefreshRepository.getLastFetchCompletion.mockResolvedValue(twoHoursAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return false when a pending refresh exists but last fetch is recent", async () => {
      mockRefreshRepository.getPending.mockResolvedValue({
        refreshId: "refresh-123",
        readyAt: "2026-01-01T00:00:00.000Z",
      });
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockRefreshRepository.getLastFetchCompletion.mockResolvedValue(tenMinutesAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(false);
    });

    it("should return true when no pending and never fetched", async () => {
      mockRefreshRepository.getPending.mockResolvedValue(null);
      mockRefreshRepository.getLastFetchCompletion.mockResolvedValue(null);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return true when last fetch is older than 1 hour", async () => {
      mockRefreshRepository.getPending.mockResolvedValue(null);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockRefreshRepository.getLastFetchCompletion.mockResolvedValue(twoHoursAgo);

      const result = await service.shouldRefresh();

      expect(result).toBe(true);
    });

    it("should return false when last fetch is less than 1 hour ago", async () => {
      mockRefreshRepository.getPending.mockResolvedValue(null);
      const thirtyMinutesAgo = new Date(
        Date.now() - 30 * 60 * 1000
      ).toISOString();
      mockRefreshRepository.getLastFetchCompletion.mockResolvedValue(
        thirtyMinutesAgo
      );

      const result = await service.shouldRefresh();

      expect(result).toBe(false);
    });
  });
});
