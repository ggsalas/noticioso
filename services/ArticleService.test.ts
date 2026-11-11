import { ArticleService } from "./ArticleService";
import { ArticleCacheService } from "./ArticleCacheService";

const mockCache = {
  getHtml: jest.fn(),
  getMetadata: jest.fn(),
};
const mockDownload = jest.fn();

const service = new ArticleService(
  mockCache as unknown as ArticleCacheService,
  mockDownload,
);

const URL = "https://example.com/article";
const HTML = `<html><head><meta property="og:site_name" content="Example Site"></head><body>Hi</body></html>`;

describe("ArticleService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("getArticle", () => {
    it("returns cached HTML with metadata without downloading", async () => {
      mockCache.getHtml.mockResolvedValueOnce(HTML);
      mockCache.getMetadata.mockResolvedValueOnce({
        heroImage: "https://example.com/image.jpg",
        title: "Test Article",
        byline: "Jane",
      });

      const result = await service.getArticle(URL);

      expect(mockDownload).not.toHaveBeenCalled();
      expect(result).toEqual({
        rawHtml: HTML,
        heroImage: "https://example.com/image.jpg",
        title: "Test Article",
        byline: "Jane",
        siteName: "Example Site",
      });
    });

    it("asks native to download when not cached, then reads it back", async () => {
      mockCache.getHtml.mockResolvedValueOnce(null).mockResolvedValueOnce(HTML);
      mockDownload.mockResolvedValueOnce("/path/file.html");
      mockCache.getMetadata.mockResolvedValueOnce({ title: "Downloaded" });

      const result = await service.getArticle(URL);

      expect(mockDownload).toHaveBeenCalledWith(URL);
      expect(mockCache.getHtml).toHaveBeenCalledTimes(2);
      expect(result.rawHtml).toBe(HTML);
      expect(result.title).toBe("Downloaded");
    });

    it("propagates the native download error", async () => {
      mockCache.getHtml.mockResolvedValueOnce(null);
      mockDownload.mockRejectedValueOnce(new Error("HTTP 404 for " + URL));

      await expect(service.getArticle(URL)).rejects.toThrow("HTTP 404");
    });

    it("fails clearly if the article still cannot be read after downloading", async () => {
      mockCache.getHtml.mockResolvedValue(null);
      mockDownload.mockResolvedValueOnce("/path/file.html");

      await expect(service.getArticle(URL)).rejects.toThrow("could not be read");
    });

    it("works without metadata", async () => {
      mockCache.getHtml.mockResolvedValueOnce("<html></html>");
      mockCache.getMetadata.mockResolvedValueOnce(null);

      const result = await service.getArticle(URL);

      expect(result).toEqual({
        rawHtml: "<html></html>",
        heroImage: undefined,
        title: undefined,
        byline: undefined,
        siteName: undefined,
      });
    });
  });
});
