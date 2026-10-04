import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import { feedCacheRepository } from "@/infrastructure/FeedCacheRepository";
import { articleCacheRepository } from "@/infrastructure/ArticleCacheRepository";
import { lastRefreshRepository } from "@/infrastructure/LastRefreshRepository";
import { articleCacheService } from "./ArticleCacheService";

export class StorageService {
  constructor(private asyncStorage: AsyncStorageStatic) {}

  async getItem<T>(key: string): Promise<T | null> {
    let jsonValue: string | null;

    try {
      jsonValue = await this.asyncStorage.getItem(key);
    } catch (error) {
      throw new Error(`Failed to get item with key "${key}": ${error}`);
    }

    // if the key do not exist in the store
    if (jsonValue === null) {
      return null;
    }

    try {
      return JSON.parse(jsonValue) as T;
    } catch {
      // If JSON parsing fails, return the raw value as T
      return jsonValue as T;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      await this.asyncStorage.setItem(key, jsonValue);
    } catch (error) {
      throw new Error(`Failed to set item with key "${key}": ${error}`);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.asyncStorage.removeItem(key);
    } catch (error) {
      throw new Error(`Failed to remove item with key "${key}": ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.asyncStorage.clear();
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }

  // Clear only app-specific caches (keeps user data like feeds list)
  // Stage 1: Clears SQLite cache tables and HTML files, preserves legacy AsyncStorage backup keys
  // Note: data_migrations table is NOT cleared - migration marker persists to prevent reimport
  async clearCaches(): Promise<void> {
    try {
      // Clear SQLite cache tables (data_migrations table is preserved)
      await feedCacheRepository.clear();
      await articleCacheRepository.clear();
      await lastRefreshRepository.clear();

      // Clear HTML files from filesystem
      await articleCacheService.clearFileCache();

      // Note: Legacy AsyncStorage backup keys are preserved during Stage 1
      // data_migrations table is preserved to prevent reimport on next launch
      // @noticioso-feedList remains untouched (user data)
      // @noticioso-article-ranking remains untouched (transient, not migrated)
    } catch (error) {
      throw new Error(`Failed to clear caches: ${error}`);
    }
  }
}

export const storageService = new StorageService(AsyncStorage);
