import { Feed } from "~/types";

import AsyncStorage from "@react-native-async-storage/async-storage";

const FEEDS_LIST_KEY = "@noticioso-feedList";

export async function getFeeds(): Promise<Array<Feed> | undefined> {
  const feedsData = await AsyncStorage.getItem(FEEDS_LIST_KEY);

  if (feedsData !== null) {
    return JSON.parse(feedsData) as Feed[];
  } else {
    throw new Error("No feeds found");
  }
}

export async function getFeedByUrl(url: string): Promise<Feed | undefined> {
  const feeds = await getFeeds();

  return feeds?.find((f) => f.url.includes(url));
}

export async function saveFeeds(feeds: Feed[]) {
  const feedsData = JSON.stringify(feeds) ?? [];
  await AsyncStorage.setItem(FEEDS_LIST_KEY, feedsData);
  return true;
}

export async function removeAllFeeds() {
  await AsyncStorage.setItem(FEEDS_LIST_KEY, "");
}

export async function importFeeds(data: string) {
  const feeds = JSON.parse(data) as Feed[];
  const hasItems = feeds.length > 0;
  const hasValues =
    feeds[0].name &&
    feeds[0].url &&
    feeds[0].oldestArticle >= 1 &&
    feeds[0].lang;

  if (hasItems && hasValues) {
    await AsyncStorage.setItem(FEEDS_LIST_KEY, data);

    return true;
  } else {
    throw new Error("Data has incorect format");
  }
}

export async function createOrEditFeed(feed: Feed) {
  try {
    const feeds = await getFeeds();
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

    return await saveFeeds(getUpdatedFeeds());
  } catch (e) {
    throw new Error("Feed cannot be added");
  }
}

export async function deleteFeed(feed: Feed) {
  try {
    const feeds = await getFeeds();
    const isExistingFeed = feeds && feeds?.some((f) => f.id === feed.id);

    if (!isExistingFeed) {
      throw new Error("Feed do not exist in the saved feeds");
    }

    const updatedFeeds = feeds.filter((f) => f.id !== feed.id);

    return await saveFeeds(updatedFeeds);
  } catch (e) {
    throw new Error("Feed cannot be deleted");
  }
}
