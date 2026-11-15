import { FeedContentService } from "./FeedContentService";
import { ArticleService } from "./ArticleService";
import { refreshRepository, feedSnapshotRepository } from "@/db";

jest.mock("@/db", () => ({
  refreshRepository: { getActive: jest.fn(), getAttemptedArticles: jest.fn() },
  feedSnapshotRepository: { get: jest.fn(), getAllForRefresh: jest.fn() },
}));

const mockRefreshRepo = refreshRepository as jest.Mocked<typeof refreshRepository>;
const mockFeedSnapshotRepo = feedSnapshotRepository as jest.Mocked<
  typeof feedSnapshotRepository
>;

const mockArticleCache = {
  getMetadata: jest.fn(),
};

const feedContentService = new FeedContentService(
  mockArticleCache as unknown as ArticleService,
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
    jest.resetAllMocks();
  });

  describe("getSnapshot", () => {
    it("returns null when no active generation exists", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(null);

      expect(await feedContentService.getSnapshot(FEED_URL)).toBeNull();
      expect(mockFeedSnapshotRepo.get).not.toHaveBeenCalled();
    });

    it("returns null when the active generation has no snapshot for the feed", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(null);

      expect(await feedContentService.getSnapshot(FEED_URL)).toBeNull();
      expect(mockFeedSnapshotRepo.get).toHaveBeenCalledWith("refresh-1", FEED_URL);
    });

    it("returns the snapshot of the active generation", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(snapshot as never);

      expect(await feedContentService.getSnapshot(FEED_URL)).toEqual({
        data: feedData,
        cachedAt: "2026-03-28T09:00:00.000Z",
      });
    });
  });

  describe("getFeedContent", () => {
    it("returns undefined when there is no snapshot (UI shows empty state)", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(null);

      expect(await feedContentService.getFeedContent(FEED_URL)).toBeUndefined();
    });

    it("enriches items with cached article metadata", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(activeRefresh);
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
      mockRefreshRepo.getActive.mockResolvedValueOnce(activeRefresh);
      mockFeedSnapshotRepo.get.mockResolvedValueOnce(snapshot as never);
      mockArticleCache.getMetadata.mockRejectedValue(new Error("db error"));

      const result = await feedContentService.getFeedContent(FEED_URL);

      expect(result?.rss.channel.item).toHaveLength(2);
      expect(result?.rss.channel.item[0].title).toBe("Article 1");
    });
  });

  describe("getArticleCounts", () => {
    it("counts the items of each feed and omits feeds without snapshot", async () => {
      mockRefreshRepo.getActive.mockResolvedValue(activeRefresh);
      mockFeedSnapshotRepo.get.mockImplementation(async (_refreshId, feedUrl) =>
        feedUrl === FEED_URL ? (snapshot as never) : null,
      );

      const counts = await feedContentService.getArticleCounts([FEED_URL, "https://other.com/feed"]);

      expect(counts).toEqual({ [FEED_URL]: 2 });
    });
  });

  describe("download status (the ● / ○ indicator)", () => {
    const URLS = ["https://example.com/article1", "https://example.com/article2"];
    const emptySnapshot = {
      ...snapshot,
      feedUrl: "https://empty.com/feed",
      data: { ...feedData, rss: { channel: { ...feedData.rss.channel, item: [] } } },
    };
    const attempted = (entries: [string, "completed" | "failed"][]) => new Map(entries);

    beforeEach(() => {
      mockRefreshRepo.getActive.mockResolvedValue(activeRefresh);
      mockFeedSnapshotRepo.getAllForRefresh.mockResolvedValue([snapshot, emptySnapshot] as never);
    });

    it("is pending while some article download was not attempted yet", async () => {
      // e.g. a freshly applied generation whose downloads are still running
      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(attempted([[URLS[0], "completed"]]));
      expect(await feedContentService.getDownloadStatuses([FEED_URL])).toEqual({ [FEED_URL]: "pending" });
      expect(mockRefreshRepo.getAttemptedArticles).toHaveBeenCalledWith(activeRefresh.refreshId);
    });

    it("is done when every article was attempted and at least one downloaded", async () => {
      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(
        attempted([[URLS[0], "completed"], [URLS[1], "failed"]]),
      );
      expect(await feedContentService.getDownloadStatuses([FEED_URL])).toEqual({ [FEED_URL]: "done" });
    });

    it("is allFailed when every article was attempted and none downloaded", async () => {
      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(
        attempted([[URLS[0], "failed"], [URLS[1], "failed"]]),
      );
      expect(await feedContentService.getDownloadStatuses([FEED_URL])).toEqual({ [FEED_URL]: "allFailed" });
    });

    it("is pending for a feed without snapshot and omitted for a feed with no articles", async () => {
      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(attempted([]));
      const result = await feedContentService.getDownloadStatuses([
        "https://missing.com/feed",
        "https://empty.com/feed",
      ]);

      expect(result).toEqual({ "https://missing.com/feed": "pending" });
    });

    it("is empty when there is no active generation", async () => {
      mockRefreshRepo.getActive.mockResolvedValue(null);

      expect(await feedContentService.getDownloadStatuses([FEED_URL])).toEqual({});
    });

    it("checks a single feed", async () => {
      mockFeedSnapshotRepo.get.mockResolvedValue(snapshot as never);

      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(
        attempted([[URLS[0], "completed"], [URLS[1], "completed"]]),
      );
      expect(await feedContentService.getFeedDownloadStatus(FEED_URL)).toBe("done");

      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(
        attempted([[URLS[0], "failed"], [URLS[1], "failed"]]),
      );
      expect(await feedContentService.getFeedDownloadStatus(FEED_URL)).toBe("allFailed");

      mockRefreshRepo.getAttemptedArticles.mockResolvedValueOnce(attempted([]));
      expect(await feedContentService.getFeedDownloadStatus(FEED_URL)).toBe("pending");

      mockFeedSnapshotRepo.get.mockResolvedValue(null);
      expect(await feedContentService.getFeedDownloadStatus(FEED_URL)).toBe("pending");
    });
  });

  describe("getLastFullRefresh", () => {
    it("returns null when no active generation exists", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(null);

      expect(await feedContentService.getLastFullRefresh()).toBeNull();
    });

    it("returns when the active generation was applied", async () => {
      mockRefreshRepo.getActive.mockResolvedValueOnce(activeRefresh);

      expect(await feedContentService.getLastFullRefresh()).toBe("2026-03-28T10:00:00.000Z");
    });
  });
});
