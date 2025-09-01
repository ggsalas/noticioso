import { XMLParser } from "fast-xml-parser";
import * as sanitize from "safe-html";
import { getFeedByUrl } from "./getFeeds";
import type { FeedData, FeedContentItem } from "~/types";

export async function getFeedContent(url: string): Promise<FeedData> {
  try {
    const feed = await getFeedByUrl(url);
    const res = await fetch(url, { method: "GET" });

    if (!res.ok) {
      throw new Error(`Error on get feeds: ${res}`);
    }
    const data = await res.text();
    const parser = new XMLParser();
    let feedContent: FeedData = parser.parse(data);
    const currentTime = new Date().getTime();
    const date24HoursAgo = new Date(currentTime - 24 * 60 * 60 * 1000);
    const date7daysAgo = new Date(currentTime - 24 * 60 * 60 * 1000 * 7);

    const items = feedContent.rss.channel.item
      // Only get news from today
      ?.filter((item: FeedContentItem) => {
        const itemDate = new Date(Date.parse(item.pubDate));
        const isFromLast24Hs = itemDate.getTime() > date24HoursAgo.getTime();
        const isFromLast7days = itemDate.getTime() > date7daysAgo.getTime();

        return feed?.oldestArticle === 7 ? isFromLast7days : isFromLast24Hs;
      })
      // Format description as plain text
      .map((item: FeedContentItem) => {
        if (isHTML(item.description)) {
          const description = sanitize(item.description, {
            allowedTags: [],
          });
          return { ...item, description };
        } else {
          return item;
        }
      });

    feedContent.rss.channel.item = items;
    feedContent.date = new Date();
    return feedContent;
  } catch (error) {
    throw new Error(`Error on get feeds: ${error}`);
  }
}

function isHTML(str: string) {
  const htmlPattern = /<[a-z][\s\S]*>/i;
  return htmlPattern.test(str);
}
