import { ArticleCacheService } from "./ArticleCacheService";
import { StorageService } from "./StorageService";

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

const articleCacheService = new ArticleCacheService(
  mockStorage as unknown as StorageService,
);

describe("ArticleCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("has", () => {
    it("should return false for non-existent article", async () => {
      mockStorage.getItem.mockResolvedValueOnce(null);

      const result = await articleCacheService.has(
        "https://example.com/not-found",
      );

      expect(mockStorage.getItem).toHaveBeenCalledWith(
        "@noticioso-articleHtmlCache-https://example.com/not-found",
      );
      expect(result).toBe(false);
    });

    it("should return true for existing article", async () => {
      const mockEntry = {
        html: "", // Full HTML now in file system
        fetchedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      mockStorage.getItem.mockResolvedValueOnce(mockEntry);

      const result = await articleCacheService.has(
        "https://example.com/article",
      );

      expect(result).toBe(true);
    });
  });

  describe("getMetadata", () => {
    it("should return null for non-existent article", async () => {
      mockStorage.getItem.mockResolvedValueOnce(null);

      const result = await articleCacheService.getMetadata(
        "https://example.com/not-found",
      );

      expect(result).toBeNull();
    });

    it("should return metadata from JSON entry", async () => {
      const mockEntry = {
        heroImage: "https://example.com/image.jpg",
        byline: "John Doe",
        title: "Test Title",
        excerpt: "Test excerpt",
        html: "", // Now stored as empty, full HTML is in file system
        fetchedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      mockStorage.getItem.mockResolvedValueOnce(mockEntry);

      const result = await articleCacheService.getMetadata(
        "https://example.com/article",
      );

      expect(result).toEqual({
        heroImage: "https://example.com/image.jpg",
        byline: "John Doe",
        title: "Test Title",
        excerpt: "Test excerpt",
      });
    });
  });

  describe("setHtml", () => {
    it("should extract metadata and save to storage", async () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/og-image.jpg">
            <meta name="author" content="Test Author">
            <meta property="og:title" content="Article Title">
            <meta property="og:description" content="Article description">
          </head>
        </html>
      `;

      mockStorage.getItem.mockResolvedValueOnce({}); // getIndex returns empty
      mockStorage.setItem.mockResolvedValue(undefined);

      await articleCacheService.setHtml("https://example.com/new", mockHtml);

      // Should save metadata (html stored in file system, not in storage entry)
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "@noticioso-articleHtmlCache-https://example.com/new",
        expect.objectContaining({
          heroImage: "https://example.com/og-image.jpg",
          byline: "Test Author",
          title: "Article Title",
          excerpt: "Article description",
          fetchedAt: expect.any(String),
          lastAccessedAt: expect.any(String),
        }),
      );
    });
  });
});