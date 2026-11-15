import { storageService, StorageService } from "./StorageService";
import type { Feed } from "~/types";

const FEEDS_LIST_KEY = "@noticioso-feedList";

/**
 * The user's feed list (AsyncStorage). Feed CONTENT is fetched and stored by
 * the native module and read through FeedContentService.
 */
export class FeedService {
  constructor(private storage: StorageService) {}

  getFeeds = async (_?: undefined): Promise<Feed[] | undefined> => {
    const feedsData = await this.storage.getItem<Feed[]>(FEEDS_LIST_KEY);

    if (feedsData !== null) {
      return feedsData;
    } else {
      return [];
    }
  };

  getFeedByUrl = async (url: string): Promise<Feed | undefined> => {
    const feeds = await this.getFeeds();
    return feeds?.find((f) => f.url.includes(url));
  };

  createOrEditFeed = async (feed: Feed): Promise<boolean> => {
    try {
      const feeds = await this.getFeeds();
      const isExistingFeed = feeds && feeds?.some((f) => f.id === feed.id);
      const isValidFeed =
        feed.name && feed.url && feed.oldestArticle >= 1 && feed.lang;

      if (!isValidFeed) {
        throw new Error("Feed is not valid");
      }

      const getUpdatedFeeds = () => {
        if (isExistingFeed) {
          return feeds.map((f) => {
            if (f.id === feed.id) {
              return feed;
            } else {
              return f;
            }
          });
        } else {
          return Array.isArray(feeds) ? [...feeds, feed] : [feed];
        }
      };

      return await this.saveFeeds(getUpdatedFeeds());
    } catch {
      throw new Error("Feed cannot be added");
    }
  };

  deleteFeed = async (feed: Feed): Promise<boolean> => {
    try {
      const feeds = await this.getFeeds();
      const isExistingFeed = feeds && feeds?.some((f) => f.id === feed.id);

      if (!isExistingFeed) {
        throw new Error("Feed do not exist in the saved feeds");
      }

      const updatedFeeds = feeds.filter((f) => f.id !== feed.id);
      return await this.saveFeeds(updatedFeeds);
    } catch {
      throw new Error("Feed cannot be deleted");
    }
  };

  importFeeds = async (data: string): Promise<boolean> => {
    let feeds: unknown;
    try {
      feeds = JSON.parse(data);
    } catch {
      throw new Error("Invalid JSON format");
    }

    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw new Error("Data must be a non-empty array");
    }

    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      if (!this.isValidFeed(feed)) {
        throw new Error(`Invalid feed at index ${i}: ${JSON.stringify(feed)}`);
      }
    }

    await this.storage.setItem(FEEDS_LIST_KEY, feeds as Feed[]);
    return true;
  };

  private isValidFeed(feed: unknown): feed is Feed {
    const f = feed as Feed;
    const idValid = typeof f.id === "string" || typeof f.id === "number";
    const oldestValid =
      typeof f.oldestArticle === "number" ||
      typeof f.oldestArticle === "string";
    const oldestValue =
      typeof f.oldestArticle === "string"
        ? parseInt(f.oldestArticle, 10)
        : f.oldestArticle;
    return !!(
      idValid &&
      f.id &&
      typeof f.name === "string" &&
      f.name &&
      typeof f.url === "string" &&
      f.url &&
      oldestValid &&
      oldestValue >= 1 &&
      typeof f.lang === "string" &&
      f.lang
    );
  }

  removeAllFeeds = async (): Promise<void> => {
    await this.storage.setItem(FEEDS_LIST_KEY, []);
  };

  saveFeeds = async (feeds: Feed[]): Promise<boolean> => {
    await this.storage.setItem(FEEDS_LIST_KEY, feeds);
    return true;
  };

  clearCaches = async (onComplete?: () => void): Promise<void> => {
    await this.storage.clearCaches();
    onComplete?.();
  };
}

export const feedService = new FeedService(storageService);
