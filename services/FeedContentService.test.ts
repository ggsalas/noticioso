import { FeedContentService } from "./FeedContentService";
import { ArticleCacheService } from "./ArticleCacheService";
import { activeRefreshRepository, feedSnapshotRepository } from "@/infrastructure";

jest.mock("@/infrastructure", () => ({
  activeRefreshRepository: { get: jest.fn() },
  feedSnapshotRepository: { get: jest.fn() },
}));

const mockActiveRefreshRepo = activeRefreshRepository as jest.Mocked<
  typeof activeRefreshRepository
>;
const mockFeedSnapshotRepo = feedSnapshotRepository as jest.Mocked<
  typeof feedSnapshotRepository
>;

const mockArticleCache = {
  getMetadata: jest.fn(),
};

const feedContentService = new FeedContentService(
  mockArticleCache as unknown as ArticleCacheService,
);

const FEED_URL = "https://example.com/feed";

const feedData = {
  date: new Date("2026-03-28T00:00:00Z"),
  feedType: "rss" as const,
  rss: {
    channel: {
      title: "Cached Feed",
      description: "desc",
      language: "en",
      link: "https://example.com",
      lastBuildDate: "2026-03-28",
      item: [
        { title: "Article 1", link: "https://example.com/article1", pubDate: "2026-03-28", description: "desc", author: "" },
        { title: "Article 2", link: "https://example.com/article2", pubDate: "2026-03-28", description: "desc", author: "" },
      ],
    },
  },
};

const activeRefresh = { refreshId: "refresh-1", appliedAt: "2026-03-28T10:00:00.000Z" };
const snapshot = {
  refreshId: "refresh-1",
  feedUrl: FEED_URL,
  data: feedData,
  cachedAt: "2026-03-28T09:00:00.000Z",
};

describe("FeedContentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSnapshot", () => {
    it("returns null when no active generation exists", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(null);

      expect(await feedContentService.getSnapshot(FEED_URL)).toBeNull();
      expect(mockFeedSnapshotRepo.get).not.toHaveBeenCalled();
    });

    it("returns null when the active generation has no snapshot for the feed", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(null);

      expect(await feedContentService.getSnapshot(FEED_URL)).toBeNull();
      expect(mockFeedSnapshotRepo.get).toHaveBeenCalledWith("refresh-1", FEED_URL);
    });

    it("returns the snapshot of the active generation", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(snapshot as never);

      expect(await feedContentService.getSnapshot(FEED_URL)).toEqual({
        data: feedData,
        cachedAt: "2026-03-28T09:00:00.000Z",
      });
    });
  });

  describe("getFeedContent", () => {
    it("returns undefined when there is no snapshot (UI shows empty state)", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(null);

      expect(await feedContentService.getFeedContent(FEED_URL)).toBeUndefined();
    });

    it("enriches items with cached article metadata", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(snapshot as never);
      mockArticleCache.getMetadata
        .mockResolvedValueOnce({
          heroImage: "https://example.com/image1.jpg",
          byline: "John Doe",
          title: "Article 1",
          excerpt: "Excerpt 1",
        })
        .mockResolvedValueOnce(null);

      const result = await feedContentService.getFeedContent(FEED_URL);

      expect(result?.rss.channel.item[0].heroImage).toBe("https://example.com/image1.jpg");
      expect(result?.rss.channel.item[0].author).toBe("John Doe");
      expect(result?.rss.channel.item[0].excerpt).toBe("Excerpt 1");
      // Second item has no cached metadata: untouched
      expect(result?.rss.channel.item[1].heroImage).toBeUndefined();
    });

    it("keeps the item when its metadata lookup fails", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(snapshot as never);
      mockArticleCache.getMetadata.mockRejectedValue(new Error("db error"));

      const result = await feedContentService.getFeedContent(FEED_URL);

      expect(result?.rss.channel.item).toHaveLength(2);
      expect(result?.rss.channel.item[0].title).toBe("Article 1");
    });
  });

  describe("getLastFullRefresh", () => {
    it("returns null when no active generation exists", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(null);

      expect(await feedContentService.getLastFullRefresh()).toBeNull();
    });

    it("returns when the active generation was applied", async () => {
      mockActiveRefreshRepo.get.mockResolvedValueOnce(activeRefresh);

      expect(await feedContentService.getLastFullRefresh()).toBe("2026-03-28T10:00:00.000Z");
    });
  });
});
