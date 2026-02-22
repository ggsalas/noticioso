import { StorageService } from "./StorageService";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

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
