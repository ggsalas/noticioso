import {
  feedCacheRepository,
  lastRefreshRepository,
  FeedCacheRepository,
  LastRefreshRepository,
} from "@/infrastructure";
import type { FeedData } from "~/types";

export type FeedCache = {
  data: FeedData;
  cachedAt: string; // ISO timestamp
};

export class FeedCacheService {
  constructor(
    private feedCacheRepo: FeedCacheRepository,
    private lastRefreshRepo: LastRefreshRepository
  ) {}

  get = async (url: string): Promise<FeedCache | null> => {
    return this.feedCacheRepo.get(url);
  };

  set = async (url: string, data: FeedData): Promise<void> => {
    try {
      await this.feedCacheRepo.set(url, data);
    } catch (error) {
      // Cache is optional - don't fail if storage fails
      console.warn("Failed to cache feed:", url, error);
    }
  };

  delete = async (url: string): Promise<void> => {
    await this.feedCacheRepo.delete(url);
  };

  getLastFullRefresh = async (): Promise<string | null> => {
    return this.lastRefreshRepo.get();
  };

  setLastFullRefresh = async (timestamp: string): Promise<void> => {
    await this.lastRefreshRepo.set(timestamp);
  };
}

export const feedCacheService = new FeedCacheService(
  feedCacheRepository,
  lastRefreshRepository
);
