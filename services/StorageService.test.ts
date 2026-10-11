import { StorageService } from "./StorageService";
import { articleCacheService } from "./ArticleCacheService";
import { articleCacheRepository } from "@/infrastructure/ArticleCacheRepository";
import { refreshRepository } from "@/infrastructure/RefreshRepository";
import { activeRefreshRepository } from "@/infrastructure/ActiveRefreshRepository";
import { pendingRefreshRepository } from "@/infrastructure/PendingRefreshRepository";
import { lastFetchCompletionRepository } from "@/infrastructure/LastFetchCompletionRepository";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

// Mock the native module
jest.mock("@/modules/FeedRefreshModule/src/FeedRefreshModule", () => ({
  __esModule: true,
  default: {
    clearArticleDownloadJobs: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

const storageService = new StorageService(
  mockStorage as unknown as AsyncStorageStatic,
);

describe("StorageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getItem", () => {
    it("should return parsed JSON value", async () => {
      mockStorage.getItem.mockResolvedValue(JSON.stringify({ name: "Test" }));

      const result = await storageService.getItem<{ name: string }>("key");

      expect(mockStorage.getItem).toHaveBeenCalledWith("key");
      expect(result).toEqual({ name: "Test" });
    });

    it("should return null for non-existent key", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      const result = await storageService.getItem("key");

      expect(result).toBeNull();
    });

    it("should return raw value if JSON parse fails", async () => {
      mockStorage.getItem.mockResolvedValue("not-json");

      const result = await storageService.getItem<string>("key");

      expect(result).toBe("not-json");
    });

    it("should throw if storage fails", async () => {
      mockStorage.getItem.mockRejectedValue(new Error("storage error"));

      await expect(storageService.getItem("key")).rejects.toThrow(
        'Failed to get item with key "key"',
      );
    });
  });

  describe("setItem", () => {
    it("should serialize and store value", async () => {
      mockStorage.setItem.mockResolvedValue(undefined);

      await storageService.setItem("key", { name: "Test" });

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        "key",
        JSON.stringify({ name: "Test" }),
      );
    });

    it("should throw if storage fails", async () => {
      mockStorage.setItem.mockRejectedValue(new Error("storage error"));

      await expect(storageService.setItem("key", "value")).rejects.toThrow(
        'Failed to set item with key "key"',
      );
    });
  });

  describe("removeItem", () => {
    it("should call removeItem on storage", async () => {
      mockStorage.removeItem.mockResolvedValue(undefined);

      await storageService.removeItem("key");

      expect(mockStorage.removeItem).toHaveBeenCalledWith("key");
    });

    it("should throw if storage fails", async () => {
      mockStorage.removeItem.mockRejectedValue(new Error("storage error"));

      await expect(storageService.removeItem("key")).rejects.toThrow(
        'Failed to remove item with key "key"',
      );
    });
  });

  describe("clearCaches", () => {
    it("clears native article download job state and HTML cache", async () => {
      const FeedRefreshModule = require("@/modules/FeedRefreshModule/src/FeedRefreshModule").default;
      const clearJobs = jest.spyOn(FeedRefreshModule, "clearArticleDownloadJobs").mockResolvedValue(undefined);
      const clearHtml = jest.spyOn(articleCacheService, "clearFileCache").mockResolvedValue(undefined);
      const clearRepos = [
        jest.spyOn(refreshRepository, "clear").mockResolvedValue(undefined),
        jest.spyOn(activeRefreshRepository, "clear").mockResolvedValue(undefined),
        jest.spyOn(pendingRefreshRepository, "clear").mockResolvedValue(undefined),
        jest.spyOn(lastFetchCompletionRepository, "clear").mockResolvedValue(undefined),
        jest.spyOn(articleCacheRepository, "clear").mockResolvedValue(undefined),
      ];

      await storageService.clearCaches();

      expect(clearJobs).toHaveBeenCalledTimes(1);
      expect(clearHtml).toHaveBeenCalledTimes(1);
      expect(mockStorage.removeItem).not.toHaveBeenCalledWith("@noticioso-feedList");

      clearJobs.mockRestore();
      clearHtml.mockRestore();
      clearRepos.forEach((spy) => spy.mockRestore());
    });
  });

  describe("clear", () => {
    it("should call clear on storage", async () => {
      mockStorage.clear.mockResolvedValue(undefined);

      await storageService.clear();

      expect(mockStorage.clear).toHaveBeenCalled();
    });

    it("should throw if storage fails", async () => {
      mockStorage.clear.mockRejectedValue(new Error("storage error"));

      await expect(storageService.clear()).rejects.toThrow(
        "Failed to clear storage",
      );
    });
  });
});
