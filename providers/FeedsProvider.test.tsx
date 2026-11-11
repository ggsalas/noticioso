// Mocks must be set up BEFORE importing modules that use them
jest.mock("../hooks/useAsyncFn", () => ({
  useAsyncFn: jest.fn(),
}));

jest.mock("@/services/FeedService", () => ({
  feedService: {
    getFeeds: jest.fn(),
    importFeeds: jest.fn(),
    saveFeeds: jest.fn(),
    createOrEditFeed: jest.fn(),
    deleteFeed: jest.fn(),
  },
}));

jest.mock("@/services/FeedContentService", () => ({
  feedContentService: {
    getArticleCounts: jest.fn().mockResolvedValue({}),
    getDownloadsAttempted: jest.fn().mockResolvedValue({}),
    isFeedDownloadAttempted: jest.fn().mockResolvedValue(false),
    getFeedContent: jest.fn(),
    getLastFullRefresh: jest.fn(),
  },
}));

jest.mock("@/services/FeedRefreshService", () => ({
  feedRefreshService: {
    refreshAllFeeds: jest.fn(),
    hasPendingRefresh: jest.fn().mockResolvedValue(false),
    applyPendingRefresh: jest.fn().mockResolvedValue(false),
    shouldRefresh: jest.fn().mockResolvedValue(false),
  },
}));

// Mock the native module events to control event emission
const mockOnArticleDownloadFeedStarted = jest.fn();
const mockOnArticleDownloadFeedComplete = jest.fn();
const mockOnFeedRefreshStarted = jest.fn();
const mockOnFeedRefreshFinished = jest.fn();
const mockOnArticleWorkerIdle = jest.fn();
jest.mock("@/modules/FeedRefreshModule/src/events", () => ({
  onArticleDownloadFeedStarted: (callback: any) => {
    mockOnArticleDownloadFeedStarted.mockImplementation(callback);
    return { remove: jest.fn() };
  },
  onArticleDownloadFeedComplete: (callback: any) => {
    mockOnArticleDownloadFeedComplete.mockImplementation(callback);
    return { remove: jest.fn() };
  },
  onFeedRefreshStarted: (callback: any) => {
    mockOnFeedRefreshStarted.mockImplementation(callback);
    return { remove: jest.fn() };
  },
  onFeedRefreshFinished: (callback: any) => {
    mockOnFeedRefreshFinished.mockImplementation(callback);
    return { remove: jest.fn() };
  },
  onArticleWorkerIdle: (callback: any) => {
    mockOnArticleWorkerIdle.mockImplementation(callback);
    return { remove: jest.fn() };
  },
}));

// Now import everything after mocks are set up
import { renderHook, act, waitFor } from "@testing-library/react-native";
import React from "react";
import { FeedsProvider, useFeedsContext } from "./FeedsProvider";
import { feedService } from "@/services/FeedService";
import { feedContentService } from "@/services/FeedContentService";
import { feedRefreshService } from "@/services/FeedRefreshService";
import { useAsyncFn } from "../hooks/useAsyncFn";

const mockUseAsyncFn = useAsyncFn as jest.MockedFunction<typeof useAsyncFn>;

const mockFeeds = [
  { id: "1", name: "Feed 1", url: "https://feed1.com", oldestArticle: 1 as const, lang: "en" as const },
  { id: "2", name: "Feed 2", url: "https://feed2.com", oldestArticle: 7 as const, lang: "es" as const },
];

const createTestFeedData = (itemCount: number) => ({
  date: new Date(),
  rss: {
    channel: {
      title: "Test Feed",
      description: "Test",
      language: "en",
      link: "https://test.com",
      lastBuildDate: new Date().toISOString(),
      item: Array.from({ length: itemCount }, (_, i) => ({
        title: `Article ${i}`,
        link: `https://test.com/article-${i}`,
        pubDate: new Date().toISOString(),
        description: "Test description",
      })),
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FeedsProvider>{children}</FeedsProvider>
);

describe("FeedsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("should provide default context values", () => {
      mockUseAsyncFn.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      expect(result.current.feedArticleCounts).toEqual({});
      expect(result.current.lastFullRefreshAt).toBeNull();
    });
  });

  describe("refreshAllFeeds", () => {
    it("should do nothing if feeds are empty", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      await act(async () => {
        await result.current.refreshAllFeeds();
      });

      expect(feedRefreshService.refreshAllFeeds).not.toHaveBeenCalled();
    });
  });

  describe("importFeeds", () => {
    it("should import feeds and refetch", async () => {
      const runFn = jest.fn();
      mockUseAsyncFn.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        runFn,
      });

      (feedService.importFeeds as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(useFeedsContext, { wrapper });

      await act(async () => {
        const success = await result.current.importFeeds("[]");
        expect(success).toBe(true);
      });

      expect(feedService.importFeeds).toHaveBeenCalledWith("[]");
      expect(runFn).toHaveBeenCalled();
    });

    it("should handle import errors", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      (feedService.importFeeds as jest.Mock).mockRejectedValue(
        new Error("Invalid format")
      );

      const { result } = renderHook(useFeedsContext, { wrapper });

      await act(async () => {
        const success = await result.current.importFeeds("invalid");
        expect(success).toBeUndefined();
      });

      expect(result.current.error).toContain("Cannot import feeds");
    });
  });

  describe("updateFeeds", () => {
    it("should update feeds and refetch", async () => {
      const runFn = jest.fn();
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn,
      });

      (feedService.saveFeeds as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(useFeedsContext, { wrapper });

      const updatedFeeds = [...mockFeeds, { id: "3", name: "New", url: "https://new.com", oldestArticle: 1 as const, lang: "en" as const }];

      await act(async () => {
        const success = await result.current.updateFeeds(updatedFeeds);
        expect(success).toBe(true);
      });

      expect(feedService.saveFeeds).toHaveBeenCalledWith(updatedFeeds);
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("addOrEditFeed", () => {
    it("should add a new feed and refetch", async () => {
      const runFn = jest.fn();
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn,
      });

      (feedService.createOrEditFeed as jest.Mock).mockResolvedValue(true);

      const newFeed = { id: "3", name: "New Feed", url: "https://new.com", oldestArticle: 1 as const, lang: "en" as const };

      const { result } = renderHook(useFeedsContext, { wrapper });

      await act(async () => {
        const success = await result.current.addOrEditFeed(newFeed);
        expect(success).toBe(true);
      });

      expect(feedService.createOrEditFeed).toHaveBeenCalledWith(newFeed);
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("deleteFeed", () => {
    it("should delete feed and refetch", async () => {
      const runFn = jest.fn();
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn,
      });

      (feedService.deleteFeed as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(useFeedsContext, { wrapper });

      await act(async () => {
        const success = await result.current.deleteFeed(mockFeeds[0]);
        expect(success).toBe(true);
      });

      expect(feedService.deleteFeed).toHaveBeenCalledWith(mockFeeds[0]);
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("lastFullRefreshAt (header 'Last full update')", () => {
    const APPLIED_AT = "2026-10-03T10:00:00.000Z";

    it("uses the applied refresh timestamp on initial load", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });
      (feedContentService.getLastFullRefresh as jest.Mock).mockResolvedValue(
        APPLIED_AT
      );

      const { result } = renderHook(useFeedsContext, { wrapper });

      await waitFor(() => {
        expect(result.current.lastFullRefreshAt).toBe(APPLIED_AT);
      });
      expect(feedContentService.getLastFullRefresh).toHaveBeenCalled();
    });

    it("leaves lastFullRefreshAt unchanged after refreshAllFeeds (before toast tap)", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });
      (feedContentService.getLastFullRefresh as jest.Mock).mockResolvedValue(
        APPLIED_AT
      );
      (feedRefreshService.refreshAllFeeds as jest.Mock).mockResolvedValue("ok");

      const { result } = renderHook(useFeedsContext, { wrapper });
      await waitFor(() => {
        expect(result.current.lastFullRefreshAt).toBe(APPLIED_AT);
      });

      (feedRefreshService.hasPendingRefresh as jest.Mock).mockResolvedValue(true);
      await act(async () => {
        await result.current.refreshAllFeeds();
      });

      expect(feedRefreshService.refreshAllFeeds).toHaveBeenCalled();
      // Native fetch must not move the header timestamp before the toast is tapped
      expect(result.current.lastFullRefreshAt).toBe(APPLIED_AT);
      expect(feedContentService.getLastFullRefresh).toHaveBeenCalledTimes(1);
      expect(result.current.shouldShowUpdateToast).toBe(true);
    });

    it("reloads the applied timestamp after refreshAndUpdateToast applies the pending refresh", async () => {
      const appliedAfterTap = "2026-10-04T09:00:00.000Z";
      const runFn = jest.fn();
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn,
      });
      (feedContentService.getLastFullRefresh as jest.Mock)
        .mockResolvedValueOnce(APPLIED_AT)
        .mockResolvedValueOnce(appliedAfterTap);
      (feedRefreshService.applyPendingRefresh as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(useFeedsContext, { wrapper });
      await waitFor(() => {
        expect(result.current.lastFullRefreshAt).toBe(APPLIED_AT);
      });

      await act(async () => {
        await result.current.refreshAndUpdateToast();
      });

      expect(feedRefreshService.applyPendingRefresh).toHaveBeenCalled();
      expect(runFn).toHaveBeenCalled();
      expect(result.current.lastFullRefreshAt).toBe(appliedAfterTap);
      expect(result.current.shouldShowUpdateToast).toBe(false);
    });
  });

  describe("articleDownloadProgress", () => {
    beforeEach(() => {
      mockOnArticleDownloadFeedStarted.mockClear();
      mockOnArticleDownloadFeedComplete.mockClear();
    });

    it("should initialize with null progress", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      expect(result.current.articleDownloadProgress).toBeNull();
    });

    it("should set fetching status when start event is received", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      // Simulate start event
      act(() => {
        mockOnArticleDownloadFeedStarted({
          refreshId: "refresh-1",
          feedCount: 5,
          articleCount: 50,
        });
      });

      expect(result.current.articleDownloadProgress).toEqual({
        refreshId: "refresh-1",
        status: "fetching",
        feedIndex: 0,
        feedCount: 5,
        articleCount: 50,
        articleSuccessCount: 0,
        articleFailedCount: 0,
      });
    });

    it("should update progress when complete event is received", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      // Simulate start event
      act(() => {
        mockOnArticleDownloadFeedStarted({
          refreshId: "refresh-1",
          feedCount: 5,
          articleCount: 50,
        });
      });

      // Simulate complete event
      act(() => {
        mockOnArticleDownloadFeedComplete({
          refreshId: "refresh-1",
          feedIndex: 2,
          feedCount: 5,
          articleCount: 10,
          articleSuccessCount: 8,
          articleFailedCount: 2,
        });
      });

      expect(result.current.articleDownloadProgress).toEqual({
        refreshId: "refresh-1",
        status: "fetching",
        feedIndex: 2,
        feedCount: 5,
        articleCount: 10,
        articleSuccessCount: 8,
        articleFailedCount: 2,
      });
    });

    it("should mark status as complete when last feed event is received", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      // Simulate start event
      act(() => {
        mockOnArticleDownloadFeedStarted({
          refreshId: "refresh-1",
          feedCount: 5,
          articleCount: 50,
        });
      });

      // Simulate last feed complete event
      act(() => {
        mockOnArticleDownloadFeedComplete({
          refreshId: "refresh-1",
          feedIndex: 5,
          feedCount: 5,
          articleCount: 10,
          articleSuccessCount: 10,
          articleFailedCount: 0,
        });
      });

      expect(result.current.articleDownloadProgress?.status).toBe("complete");
    });
  });

  describe("feedDownloadsAttempted", () => {
    it("should initialize with empty completeness map", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      expect(result.current.feedDownloadsAttempted).toEqual({});
    });

    it("should expose refreshActiveFeedCacheState callback", () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      const { result } = renderHook(useFeedsContext, { wrapper });

      expect(typeof result.current.refreshActiveFeedCacheState).toBe("function");
    });
  });

  describe("clearFeedArticleCounts (after Clear cache)", () => {
    it("resets everything derived from generations", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });
      (feedContentService.getLastFullRefresh as jest.Mock).mockResolvedValue(
        "2026-10-03T10:00:00.000Z",
      );
      (feedRefreshService.hasPendingRefresh as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(useFeedsContext, { wrapper });
      await waitFor(() => expect(result.current.shouldShowUpdateToast).toBe(true));
      await waitFor(() => expect(result.current.lastFullRefreshAt).not.toBeNull());

      act(() => {
        result.current.clearFeedArticleCounts();
      });

      expect(result.current.shouldShowUpdateToast).toBe(false);
      expect(result.current.lastFullRefreshAt).toBeNull();
      expect(result.current.feedArticleCounts).toEqual({});
      expect(result.current.articleDownloadProgress).toBeNull();

      (feedRefreshService.hasPendingRefresh as jest.Mock).mockResolvedValue(false);
      (feedContentService.getLastFullRefresh as jest.Mock).mockResolvedValue(null);
    });
  });

  describe("refresh triggers and native worker lifecycle", () => {
    const { feedRefreshService: mockRefreshService } = jest.requireMock(
      "@/services/FeedRefreshService",
    );

    beforeEach(() => {
      mockUseAsyncFn.mockReturnValue({
        data: mockFeeds,
        loading: false,
        error: null,
        runFn: jest.fn(),
      });
    });

    afterEach(() => {
      mockRefreshService.hasPendingRefresh.mockResolvedValue(false);
      mockRefreshService.shouldRefresh.mockResolvedValue(false);
      mockRefreshService.refreshAllFeeds.mockReset();
    });

    it("refreshes on mount when stale even if an unapplied pending generation exists", async () => {
      mockRefreshService.hasPendingRefresh.mockResolvedValue(true);
      mockRefreshService.shouldRefresh.mockResolvedValue(true);
      mockRefreshService.refreshAllFeeds.mockResolvedValue("3 feeds downloaded successfully, 0 failed");

      const { result } = renderHook(useFeedsContext, { wrapper });

      await waitFor(() => expect(mockRefreshService.refreshAllFeeds).toHaveBeenCalledTimes(1));
      expect(result.current.shouldShowUpdateToast).toBe(true);
    });

    it("still requests a refresh while article progress is fetching (native queues it)", async () => {
      const { result } = renderHook(useFeedsContext, { wrapper });

      act(() => {
        mockOnArticleDownloadFeedStarted({ refreshId: "r1", feedCount: 2, articleCount: 10 });
      });
      expect(result.current.articleDownloadProgress?.status).toBe("fetching");

      mockRefreshService.refreshAllFeeds.mockResolvedValue("Feed refresh queued");
      await act(async () => {
        await result.current.refreshAllFeeds();
      });

      expect(mockRefreshService.refreshAllFeeds).toHaveBeenCalledTimes(1);
    });

    it("tracks a queued feed pass via started/finished events and shows the toast", async () => {
      const { result } = renderHook(useFeedsContext, { wrapper });

      act(() => {
        mockOnFeedRefreshStarted({ feedCount: 3 });
      });
      expect(result.current.updating).toEqual({ name: "FETCHING", current: 0, total: 3 });

      mockRefreshService.hasPendingRefresh.mockResolvedValue(true);
      await act(async () => {
        await mockOnFeedRefreshFinished({ refreshId: "r2", result: "ok" });
      });

      expect(result.current.updating).toBeNull();
      expect(result.current.shouldShowUpdateToast).toBe(true);
    });

    it("clears fetching progress on worker idle even without a last-feed event", () => {
      const { result } = renderHook(useFeedsContext, { wrapper });

      act(() => {
        mockOnArticleDownloadFeedStarted({ refreshId: "r1", feedCount: 4, articleCount: 40 });
      });
      expect(result.current.articleDownloadProgress?.status).toBe("fetching");

      act(() => {
        mockOnArticleWorkerIdle();
      });

      expect(result.current.articleDownloadProgress?.status).toBe("complete");
    });
  });
});
