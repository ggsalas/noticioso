import { XMLParser } from "fast-xml-parser";
import sanitize from "safe-html";
import { storageService, StorageService } from "./StorageService";
import { feedCacheService, FeedCacheService } from "./FeedCacheService";
import type { Feed, FeedData, FeedContentItem, ParsedFeed } from "~/types";
import {
  detectFeedType,
  normalizeToChannel,
} from "@/lib/feedSchema";

const FEEDS_LIST_KEY = "@noticioso-feedList";

export class FeedService {
  private xmlParser: XMLParser;

  constructor(
    private storage: StorageService = storageService,
    private cache: FeedCacheService = feedCacheService,
  ) {
    this.xmlParser = new XMLParser();
  }

  getFeedContent = async (
    url: string,
    onCacheLoaded?: (data: FeedData) => void,
  ): Promise<FeedData> => {
    try {
      // Serve from cache immediately if available
      if (onCacheLoaded) {
        const cached = await this.cache.get(url);
        if (cached) {
          onCacheLoaded(cached.data);
        }
      }

      const feed = await this.getFeedByUrl(url);

      // Fetch and parse RSS content
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        throw new Error(
          `Failed to fetch feed from ${url}: ${res.status} ${res.statusText}`,
        );
      }

      const data = await res.text();
      const rawParsed = this.xmlParser.parse(data) as ParsedFeed;

      // Detect feed type and validate
      const feedType = detectFeedType(rawParsed);
      if (feedType === "unknown") {
        throw new Error(
          "Unsupported feed format. Only RSS, Atom, and RDF feeds are supported.",
        );
      }

      // Normalize to common channel structure
      const channel = normalizeToChannel(rawParsed);

      // Apply date filtering based on feed settings
      const currentTime = new Date().getTime();
      const date24HoursAgo = new Date(currentTime - 24 * 60 * 60 * 1000);
      const date7daysAgo = new Date(currentTime - 24 * 60 * 60 * 1000 * 7);

      const items = channel.item
        ?.filter((item: FeedContentItem) => {
          const itemDate = new Date(Date.parse(item.pubDate));
          const isFromLast24Hs = itemDate.getTime() > date24HoursAgo.getTime();
          const isFromLast7days = itemDate.getTime() > date7daysAgo.getTime();

          return feed?.oldestArticle === 7 ? isFromLast7days : isFromLast24Hs;
        })
        // Sanitize descriptions
        .map((item: FeedContentItem) => {
          if (this.isHTML(item.description)) {
            const description = this.sanitizeContent(item.description);
            return { ...item, description };
          } else {
            return item;
          }
        });

      // Build the normalized FeedData
      const feedContent: FeedData = {
        date: new Date(),
        feedType,
        rss: {
          channel: {
            ...channel,
            item: items,
          },
        },
      };

      await this.cache.set(url, feedContent);

      return feedContent;
    } catch (error) {
      throw new Error(`Error fetching feed content: ${error}`);
    }
  };

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
      await this.cache.delete(feed.url);
      return await this.saveFeeds(updatedFeeds);
    } catch {
      throw new Error("Feed cannot be deleted");
    }
  };

  importFeeds = async (data: string): Promise<boolean> => {
    const feeds = JSON.parse(data) as Feed[];
    const hasItems = feeds.length > 0;
    const hasValues =
      feeds[0].name &&
      feeds[0].url &&
      feeds[0].oldestArticle >= 1 &&
      feeds[0].lang;

    if (hasItems && hasValues) {
      await this.storage.setItem(FEEDS_LIST_KEY, feeds);
      return true;
    } else {
      throw new Error("Data has incorrect format");
    }
  };

  removeAllFeeds = async (): Promise<void> => {
    await this.storage.setItem(FEEDS_LIST_KEY, []);
  };

  saveFeeds = async (feeds: Feed[]): Promise<boolean> => {
    await this.storage.setItem(FEEDS_LIST_KEY, feeds);
    return true;
  };

  private sanitizeContent(content: string): string {
    return sanitize(content, {
      allowedTags: [],
    });
  }

  private isHTML(str: string): boolean {
    const htmlPattern = /<[a-z][\s\S]*>/i;
    return htmlPattern.test(str);
  }
}

export const feedService = new FeedService(storageService, feedCacheService);
