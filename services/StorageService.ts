import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

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
  async clearCaches(): Promise<void> {
    try {
      const allKeys = await this.asyncStorage.getAllKeys();
      const cacheKeys = [
        "@noticioso-feedCache-",
        "@noticioso-articleHtmlCache-",
        "@noticioso-articleHtmlCache-index",
        "@noticioso-lastFullRefresh",
        "@noticioso-article-ranking",
      ];
      
      const keysToRemove = allKeys.filter(key => 
        cacheKeys.some(cacheKey => key.includes(cacheKey))
      );
      
      if (keysToRemove.length > 0) {
        await this.asyncStorage.multiRemove(keysToRemove);
      }
    } catch (error) {
      throw new Error(`Failed to clear caches: ${error}`);
    }
  }
}

export const storageService = new StorageService(AsyncStorage);
