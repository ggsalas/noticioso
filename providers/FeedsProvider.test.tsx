// Mocks must be set up BEFORE importing modules that use them
jest.mock("../hooks/useAsyncFn", () => ({
  useAsyncFn: jest.fn(),
}));

jest.mock("../lib/batchPromises", () => ({
  batchPromises: jest.fn(),
}));

jest.mock("@/services/FeedService", () => {
  const createMockFeedContent = (itemCount: number) => ({
    data: {
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
      feedType: "rss" as const,
    },
    fromCache: false,
  });

  return {
    feedService: {
      getFeeds: jest.fn(),
      importFeeds: jest.fn(),
      saveFeeds: jest.fn(),
      createOrEditFeed: jest.fn(),
      deleteFeed: jest.fn(),
      getFeedContent: jest.fn().mockImplementation((url: string) => 
        Promise.resolve(url.includes("feed1") 
          ? createMockFeedContent(5) 
          : createMockFeedContent(10)
        )
      ),
    },
  };
});

jest.mock("@/services/FeedCacheService", () => ({
  feedCacheService: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    getLastFullRefresh: jest.fn(),
    setLastFullRefresh: jest.fn(),
  },
}));

// Now import everything after mocks are set up
import { renderHook, act, waitFor } from "@testing-library/react-native";
import React from "react";
import { FeedsProvider, useFeedsContext } from "./FeedsProvider";
import { feedService } from "@/services/FeedService";
import { feedCacheService } from "@/services/FeedCacheService";
import { useAsyncFn } from "../hooks/useAsyncFn";
import { batchPromises } from "../lib/batchPromises";

const mockUseAsyncFn = useAsyncFn as jest.MockedFunction<typeof useAsyncFn>;
const mockBatchPromises = batchPromises as jest.MockedFunction<typeof batchPromises>;

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
    mockBatchPromises.mockResolvedValue([]);
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

  describe("fetchFeedCounts", () => {
    it("should not call batchPromises when feeds array is empty", async () => {
      mockUseAsyncFn.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        runFn: jest.fn(),
      });

      renderHook(useFeedsContext, { wrapper });

      await waitFor(() => {
        expect(mockBatchPromises).not.toHaveBeenCalled();
      });
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

      expect(mockBatchPromises).not.toHaveBeenCalled();
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
});
