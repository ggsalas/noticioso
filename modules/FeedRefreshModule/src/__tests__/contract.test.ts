/**
 * JS side of the JS <-> native contracts (see ../../contract/README.md).
 * The Kotlin side is android/src/test/java/ContractTest.kt, reading the same files.
 */
import { DATABASE_NAME } from "@/db/database";
import {
  ARTICLE_HTML_DIRECTORY,
  articleFileName,
  ArticleService,
} from "@/services/ArticleService";
import { FeedContentService } from "@/services/FeedContentService";
import { refreshRepository, feedSnapshotRepository } from "@/db";
import database from "../../contract/database.json";
import fileNames from "../../contract/article-file-names.json";
import feedSnapshot from "../../contract/feed-snapshot.json";

jest.mock("@/db", () => ({
  refreshRepository: { getActive: jest.fn() },
  feedSnapshotRepository: { get: jest.fn() },
}));

describe("JS <-> native contract", () => {
  it("database file name", () => {
    // expo-sqlite opens databases in <filesDir>/SQLite/<name>; native opens the same path
    expect(DATABASE_NAME).toBe(database.name);
    expect(database.directory).toBe("SQLite");
  });

  it("article cache folder and file names", () => {
    expect(ARTICLE_HTML_DIRECTORY).toBe(fileNames.directory);
    for (const { url, fileName } of fileNames.cases) {
      expect(articleFileName(url)).toBe(fileName);
    }
  });

  it("feed snapshot written by native is readable as feed content", async () => {
    (refreshRepository.getActive as jest.Mock).mockResolvedValue({
      refreshId: "r1",
      appliedAt: "2026-11-10T10:00:00.000Z",
    });
    (feedSnapshotRepository.get as jest.Mock).mockResolvedValue({
      refreshId: "r1",
      feedUrl: "https://example.com/feed",
      data: feedSnapshot,
      cachedAt: "2026-11-10T09:00:00.000Z",
    });
    const articles = { getMetadata: jest.fn().mockResolvedValue(null) };
    const service = new FeedContentService(articles as unknown as ArticleService);

    const content = await service.getFeedContent("https://example.com/feed");

    expect(content?.feedType).toBe("rss");
    expect(content?.rss.channel.title).toBe("Contract Feed");
    const items = content?.rss.channel.item ?? [];
    expect(items.map((i) => i.link)).toEqual(["https://example.com/1", "https://example.com/2"]);
    expect(items[0].title).toBe('First "quoted" title');
    expect(items[0].description).toBe("Line one\nLine two");
    // Article metadata is looked up by the item link (the article URL)
    expect(articles.getMetadata).toHaveBeenCalledWith("https://example.com/1");
  });
});
