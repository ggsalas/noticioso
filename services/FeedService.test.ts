import { FeedService } from "./FeedService";
import { StorageService } from "./StorageService";

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

const feedService = new FeedService(mockStorage as unknown as StorageService);

describe("FeedService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getFeeds", () => {
    it("should return feeds from storage", async () => {
      const mockFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];

      mockStorage.getItem.mockResolvedValue(mockFeeds);

      const result = await feedService.getFeeds();

      expect(mockStorage.getItem).toHaveBeenCalledWith("@noticioso-feedList");
      expect(result).toEqual(mockFeeds);
    });

    it("should return empty array when no feeds found", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      const result = await feedService.getFeeds();

      expect(mockStorage.getItem).toHaveBeenCalledWith("@noticioso-feedList");
      expect(result).toEqual([]);
    });
  });

  describe("createOrEditFeed", () => {
    it("should create a new feed", async () => {
      const newFeed = {
        id: "new",
        name: "New Feed",
        url: "https://new.com",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      mockStorage.getItem.mockResolvedValue([]);
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.createOrEditFeed(newFeed);

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [
        newFeed,
      ]);
    });

    it("should throw error for invalid feed", async () => {
      const invalidFeed = {
        id: "invalid",
        name: "",
        url: "https://example.com",
        oldestArticle: 1 as const,
        lang: "en" as const,
      };

      mockStorage.getItem.mockResolvedValue([]);

      await expect(feedService.createOrEditFeed(invalidFeed)).rejects.toThrow(
        "Feed cannot be added",
      );
    });
  });

  describe("deleteFeed", () => {
    it("should delete existing feed", async () => {
      const existingFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];
      const feedToDelete = existingFeeds[0];

      mockStorage.getItem.mockResolvedValue(existingFeeds);
      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.deleteFeed(feedToDelete);

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith("@noticioso-feedList", [
        existingFeeds[1],
      ]);
    });
  });

  describe("importFeeds", () => {
    it("should import valid feeds", async () => {
      const validFeeds = [
        {
          id: "1",
          name: "Feed 1",
          url: "https://example1.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
        {
          id: "2",
          name: "Feed 2",
          url: "https://example2.com",
          oldestArticle: 7 as const,
          lang: "es" as const,
        },
      ];

      mockStorage.setItem.mockResolvedValue(undefined);

      const result = await feedService.importFeeds(JSON.stringify(validFeeds));

      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "@noticioso-feedList",
        validFeeds,
      );
    });

    it("should throw error for invalid JSON", async () => {
      await expect(feedService.importFeeds("not valid json")).rejects.toThrow(
        "Invalid JSON format",
      );
    });

    it("should throw error for empty array", async () => {
      await expect(feedService.importFeeds("[]")).rejects.toThrow(
        "Data must be a non-empty array",
      );
    });

    it("should throw error for invalid feed data", async () => {
      const invalidFeeds = [
        {
          id: "1",
          name: "",
          url: "https://example.com",
          oldestArticle: 1 as const,
          lang: "en" as const,
        },
      ];

      await expect(
        feedService.importFeeds(JSON.stringify(invalidFeeds)),
      ).rejects.toThrow("Invalid feed at index 0");
    });

    it("should throw error when oldestArticle is less than 1", async () => {
      const invalidFeeds = [
        {
          id: "1",
          name: "Feed",
          url: "https://example.com",
          oldestArticle: 0 as const,
          lang: "en" as const,
        },
      ];

      await expect(
        feedService.importFeeds(JSON.stringify(invalidFeeds)),
      ).rejects.toThrow("Invalid feed at index 0");
    });
  });
});
