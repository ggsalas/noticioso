import AsyncStorage from "@react-native-async-storage/async-storage";
import { LegacyCacheCleanup } from "./LegacyCacheCleanup";

// Mock expo-file-system new API (Directory, File, Paths)
const mockFileDelete = jest.fn();
const mockDirectoryList = jest.fn();
const mockDirectoryExists = jest.fn();

jest.mock("expo-file-system", () => ({
  Paths: {
    cache: "/mock/cache",
  },
  Directory: jest.fn().mockImplementation(() => ({
    get exists() { return mockDirectoryExists(); },
    list: () => mockDirectoryList(),
  })),
  File: jest.fn().mockImplementation((path: string) => ({
    uri: path,
    delete: mockFileDelete,
  })),
}));

import { Directory, File } from "expo-file-system";

describe("LegacyCacheCleanup", () => {
  let cleanup: LegacyCacheCleanup;

  beforeEach(async () => {
    cleanup = new LegacyCacheCleanup();
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // Default: directory exists with no files
    mockDirectoryExists.mockReturnValue(true);
    mockDirectoryList.mockReturnValue([]);
  });

  describe("run", () => {
    it("should complete cleanup on fresh install with no legacy data", async () => {
      await cleanup.run();

      const isCompleted = await cleanup.isCompleted();
      expect(isCompleted).toBe(true);
    });

    it("should preserve @noticioso-feedList", async () => {
      const feedList = [
        { id: "1", name: "Test Feed", url: "https://example.com/feed" },
      ];
      await AsyncStorage.setItem(
        "@noticioso-feedList",
        JSON.stringify(feedList),
      );

      await cleanup.run();

      const preserved = await AsyncStorage.getItem("@noticioso-feedList");
      expect(preserved).toBe(JSON.stringify(feedList));
    });

    it("should remove legacy AsyncStorage keys", async () => {
      // Set up legacy keys
      await AsyncStorage.setItem("@noticioso-feedCache", "{}");
      await AsyncStorage.setItem("@noticioso-feedCacheIndex", "[]");
      await AsyncStorage.setItem("@noticioso-lastFullRefresh", "2024-01-01");
      await AsyncStorage.setItem("@noticioso-articleHtmlCache", "{}");
      await AsyncStorage.setItem("@noticioso-articleHtmlCacheIndex", "[]");
      await AsyncStorage.setItem("@noticioso-articleMetadataCache", "{}");
      await AsyncStorage.setItem("@noticioso-article-ranking", "{}");
      await AsyncStorage.setItem(
        "@noticioso-feedCache-https://example.com",
        "{}",
      );
      await AsyncStorage.setItem(
        "@noticioso-articleHtmlCache-https://example.com/article",
        "<html></html>",
      );

      await cleanup.run();

      // Verify all legacy keys are removed
      expect(await AsyncStorage.getItem("@noticioso-feedCache")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-feedCacheIndex")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-lastFullRefresh")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-articleHtmlCache")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-articleHtmlCacheIndex")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-articleMetadataCache")).toBeNull();
      expect(await AsyncStorage.getItem("@noticioso-article-ranking")).toBeNull();
      expect(
        await AsyncStorage.getItem("@noticioso-feedCache-https://example.com"),
      ).toBeNull();
      expect(
        await AsyncStorage.getItem(
          "@noticioso-articleHtmlCache-https://example.com/article",
        ),
      ).toBeNull();
    });

    it("should be idempotent - not rerun after successful completion", async () => {
      await cleanup.run();
      const firstRun = await cleanup.isCompleted();

      // Set up some legacy keys after first run
      await AsyncStorage.setItem("@noticioso-feedCache", "{}");

      // Run again
      await cleanup.run();

      // Should still be marked as completed (cleanup didn't run again)
      const secondRun = await cleanup.isCompleted();
      expect(secondRun).toBe(firstRun);

      // Legacy key should still exist (cleanup didn't remove it)
      const key = await AsyncStorage.getItem("@noticioso-feedCache");
      expect(key).toBe("{}");
    });

    it("should retry if cleanup fails and not mark as completed", async () => {
      // Mock getAllKeys to throw error
      const getAllKeysSpy = jest
        .spyOn(AsyncStorage, "getAllKeys")
        .mockRejectedValueOnce(new Error("Storage error"));

      await expect(cleanup.run()).rejects.toThrow("Storage error");

      // Should not be marked as completed
      const isCompleted = await cleanup.isCompleted();
      expect(isCompleted).toBe(false);

      // Restore mock and re-apply default empty array for retry
      getAllKeysSpy.mockRestore();
      jest.spyOn(AsyncStorage, "getAllKeys").mockResolvedValue([]);

      // Should succeed on retry
      await cleanup.run();
      expect(await cleanup.isCompleted()).toBe(true);
    });

    it("should remove HTML cache files from filesystem", async () => {
      // Mock directory exists and contains files
      mockDirectoryExists.mockReturnValue(true);
      
      const mockFile1 = { uri: "/mock/cache/article-html/article1.html", delete: mockFileDelete };
      const mockFile2 = { uri: "/mock/cache/article-html/article2.html", delete: mockFileDelete };
      mockDirectoryList.mockReturnValue([mockFile1, mockFile2]);

      await cleanup.run();

      // Verify directory was created with correct path
      expect(Directory).toHaveBeenCalledWith(expect.anything(), "article-html");

      // Verify each file was deleted
      expect(mockFileDelete).toHaveBeenCalledTimes(2);
    });

    it("should handle missing HTML cache directory gracefully", async () => {
      mockDirectoryExists.mockReturnValue(false);

      await cleanup.run();

      // Should not try to list or delete
      expect(mockDirectoryList).not.toHaveBeenCalled();
      expect(mockFileDelete).not.toHaveBeenCalled();
    });

    it("should continue even if HTML cache cleanup fails", async () => {
      mockDirectoryExists.mockReturnValue(true);
      mockDirectoryList.mockImplementation(() => {
        throw new Error("Read error");
      });

      // Should not throw
      await cleanup.run();

      // Should still be marked as completed
      expect(await cleanup.isCompleted()).toBe(true);
    });
  });

  describe("isCompleted", () => {
    it("should return false when not completed", async () => {
      const isCompleted = await cleanup.isCompleted();
      expect(isCompleted).toBe(false);
    });

    it("should return true after successful cleanup", async () => {
      await cleanup.run();
      const isCompleted = await cleanup.isCompleted();
      expect(isCompleted).toBe(true);
    });
  });

  describe("resetForTesting", () => {
    it("should reset the cleanup marker", async () => {
      await cleanup.run();
      expect(await cleanup.isCompleted()).toBe(true);

      await cleanup.resetForTesting();
      expect(await cleanup.isCompleted()).toBe(false);
    });
  });
});
