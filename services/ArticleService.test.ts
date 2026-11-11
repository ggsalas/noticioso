import { ArticleService } from "./ArticleService";
import { ArticleMetadataRepository } from "@/db/ArticleMetadataRepository";

const mockRepo = {
  getMetadata: jest.fn(),
  getMetadataPresentUrls: jest.fn(),
};
const mockDownload = jest.fn();

const URL = "https://example.com/article";
const HTML = `<html><head><meta property="og:site_name" content="Example Site"></head><body>Hi</body></html>`;

describe("ArticleService", () => {
  let service: ArticleService;
  let getHtml: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ArticleService(
      mockRepo as unknown as ArticleMetadataRepository,
      mockDownload,
    );
    // Reading the HTML file needs the device filesystem; stub that single step
    getHtml = jest.spyOn(service, "getHtml");
  });

  describe("getArticle", () => {
    it("returns cached HTML with metadata without downloading", async () => {
      getHtml.mockResolvedValueOnce(HTML);
      mockRepo.getMetadata.mockResolvedValueOnce({
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
      getHtml.mockResolvedValueOnce(null).mockResolvedValueOnce(HTML);
      mockDownload.mockResolvedValueOnce("/path/file.html");
      mockRepo.getMetadata.mockResolvedValueOnce({ title: "Downloaded" });

      const result = await service.getArticle(URL);

      expect(mockDownload).toHaveBeenCalledWith(URL);
      expect(getHtml).toHaveBeenCalledTimes(2);
      expect(result.rawHtml).toBe(HTML);
      expect(result.title).toBe("Downloaded");
    });

    it("propagates the native download error", async () => {
      getHtml.mockResolvedValueOnce(null);
      mockDownload.mockRejectedValueOnce(new Error("HTTP 404 for " + URL));

      await expect(service.getArticle(URL)).rejects.toThrow("HTTP 404");
    });

    it("fails clearly if the article still cannot be read after downloading", async () => {
      getHtml.mockResolvedValue(null);
      mockDownload.mockResolvedValueOnce("/path/file.html");

      await expect(service.getArticle(URL)).rejects.toThrow("could not be read");
    });

    it("works without metadata", async () => {
      getHtml.mockResolvedValueOnce("<html></html>");
      mockRepo.getMetadata.mockResolvedValueOnce(null);

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

  describe("getMetadata", () => {
    it("returns metadata from the repository", async () => {
      const metadata = { title: "T", heroImage: "https://example.com/i.jpg" };
      mockRepo.getMetadata.mockResolvedValueOnce(metadata);

      expect(await service.getMetadata(URL)).toBe(metadata);
      expect(mockRepo.getMetadata).toHaveBeenCalledWith(URL);
    });

    it("returns null for an article that is not cached", async () => {
      mockRepo.getMetadata.mockResolvedValueOnce(null);

      expect(await service.getMetadata(URL)).toBeNull();
    });
  });

  describe("getHtml", () => {
    it("is null without metadata (an article needs metadata AND file)", async () => {
      getHtml.mockRestore();
      mockRepo.getMetadata.mockResolvedValueOnce(null);

      expect(await service.getHtml(URL)).toBeNull();
    });
  });

  describe("getFullyCachedUrls", () => {
    it("does not query for an empty list", async () => {
      expect(await service.getFullyCachedUrls([])).toEqual([]);
      expect(mockRepo.getMetadataPresentUrls).not.toHaveBeenCalled();
    });
  });
});
