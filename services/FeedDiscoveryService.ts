import { discoverFeeds as feedscoutDiscover } from "feedscout";

export type DiscoveredFeed = {
  title: string;
  url: string;
  type: string;
};

export class FeedDiscoveryService {
  discoverFeeds = async (siteUrl: string): Promise<DiscoveredFeed[]> => {
    const normalizedUrl = this.normalizeUrl(siteUrl);

    try {
      const results = await feedscoutDiscover(normalizedUrl);
      console.log("[FeedDiscovery] discovered feeds:", normalizedUrl, results);

      const uniqueMap = new Map<string, DiscoveredFeed>();
      results
        .filter((f) => f.isValid)
        .forEach((f) => {
          if (!uniqueMap.has(f.url)) {
            uniqueMap.set(f.url, {
              title: f.title ?? f.url,
              url: f.url,
              type: f.format ?? "",
            });
          }
        });

      return Array.from(uniqueMap.values());
    } catch (error) {
      console.log("[FeedDiscovery] error:", error);
      throw new Error(`Error discovering feeds: ${error}`);
    }
  };

  private normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
}

export const feedDiscoveryService = new FeedDiscoveryService();
