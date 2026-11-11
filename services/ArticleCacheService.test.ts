import { ArticleCacheService } from "./ArticleCacheService";
import { ArticleCacheRepository } from "../infrastructure/ArticleCacheRepository";

const mockRepository = {
  has: jest.fn(),
  getMetadata: jest.fn(),
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
});
