import { ArticleCacheService } from "./ArticleCacheService";
import { ArticleCacheRepository } from "../infrastructure/ArticleCacheRepository";

const mockRepository = {
  has: jest.fn(),
  getMetadata: jest.fn(),
  setMetadata: jest.fn(),
  updateLastAccessed: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  getOldestNeverAccessed: jest.fn(),
  getOldestByLastAccessed: jest.fn(),
};

const articleCacheService = new ArticleCacheService(
  mockRepository as unknown as ArticleCacheRepository,
);

describe("ArticleCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("has", () => {
    it("should return false for non-existent article", async () => {
      mockRepository.has.mockResolvedValueOnce(false);

      const result = await articleCacheService.has(
        "https://example.com/not-found",
      );

      expect(mockRepository.has).toHaveBeenCalledWith(
        "https://example.com/not-found",
      );
      expect(result).toBe(false);
    });

    it("should return true for existing article", async () => {
      mockRepository.has.mockResolvedValueOnce(true);

      const result = await articleCacheService.has(
        "https://example.com/article",
      );

      expect(result).toBe(true);
    });
  });

  describe("getMetadata", () => {
    it("should return null for non-existent article", async () => {
      mockRepository.getMetadata.mockResolvedValueOnce(null);

      const result = await articleCacheService.getMetadata(
        "https://example.com/not-found",
      );

      expect(result).toBeNull();
    });

    it("should return metadata from repository", async () => {
      const mockMetadata = {
        heroImage: "https://example.com/image.jpg",
        byline: "John Doe",
        title: "Test Title",
        excerpt: "Test excerpt",
      };

      mockRepository.getMetadata.mockResolvedValueOnce(mockMetadata);

      const result = await articleCacheService.getMetadata(
        "https://example.com/article",
      );

      expect(result).toEqual(mockMetadata);
    });
  });

  describe("setHtml", () => {
    it("should extract metadata and save to repository", async () => {
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

      mockRepository.count.mockResolvedValue(0);
      mockRepository.setMetadata.mockResolvedValue(undefined);

      await articleCacheService.setHtml("https://example.com/new", mockHtml);

      // Should save metadata to repository
      expect(mockRepository.setMetadata).toHaveBeenCalledWith(
        "https://example.com/new",
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