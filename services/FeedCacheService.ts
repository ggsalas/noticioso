import { storageService, StorageService } from "./StorageService";
import type { FeedData } from "~/types";

const CACHE_KEY_PREFIX = "@noticioso-feedCache-";
export const LAST_FULL_REFRESH_KEY = "@noticioso-lastFullRefresh";

export type FeedCache = {
  data: FeedData;
  cachedAt: string; // ISO timestamp
};

export class FeedCacheService {
  constructor(private storage: StorageService = storageService) {}

  get = async (url: string): Promise<FeedCache | null> => {
    return this.storage.getItem<FeedCache>(this.cacheKey(url));
  };

  set = async (url: string, data: FeedData): Promise<void> => {
    const entry: FeedCache = { data, cachedAt: new Date().toISOString() };
    await this.storage.setItem(this.cacheKey(url), entry);
  };

  delete = async (url: string): Promise<void> => {
    await this.storage.removeItem(this.cacheKey(url));
  };

  getLastFullRefresh = async (): Promise<string | null> => {
    return this.storage.getItem<string>(LAST_FULL_REFRESH_KEY);
  };

  setLastFullRefresh = async (timestamp: string): Promise<void> => {
    await this.storage.setItem(LAST_FULL_REFRESH_KEY, timestamp);
  };

  private cacheKey(url: string): string {
    return `${CACHE_KEY_PREFIX}${url}`;
  }
}

export const feedCacheService = new FeedCacheService(storageService);
