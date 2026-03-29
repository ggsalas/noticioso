import { parseHTML } from "linkedom";
import { XMLParser } from "fast-xml-parser";
import { parseAndNormalizeFeed } from "@/lib/feedSchema";

export type Fetcher = typeof fetch;

const COMMON_PATHS = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/feed.xml",
  "/atom.xml",
  "/feeds",
  "/blog/rss",
  "/rss/lo-ultimo/",
];

export type DiscoveredFeed = {
  title: string;
  url: string;
  type: string;
};

function isUrl(input: string): boolean {
  return /^https?:\/\//.test(input) || (/\./.test(input) && !/\s/.test(input));
}

export class FeedDiscoveryService {
  private fetcher: Fetcher;
  private xmlParser: XMLParser;

  constructor(fetcher: Fetcher) {
    this.fetcher = fetcher;
    this.xmlParser = new XMLParser();
  }

  private async safeFetch(url: string): Promise<string | null> {
    try {
      const res = await this.fetcher(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const status = res.status;
      if (status < 200 || status >= 300) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  private tryParseFeed(
    text: string | null,
  ): import("@/lib/feedSchema").FeedMetadata | null {
    try {
      return parseAndNormalizeFeed(text);
    } catch {
      return null;
    }
  }

  private async checkFeed(
    url: string,
  ): Promise<{ valid: boolean; title?: string }> {
    const text = await this.safeFetch(url);
    const metadata = this.tryParseFeed(text);

    if (!metadata) {
      return { valid: false };
    }

    return { valid: true, title: metadata.channel.title };
  }

  private async searchDuckDuckGo(
    query: string,
    maxResults: number = 3,
  ): Promise<string[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " rss")}`;
    const html = await this.safeFetch(url);
    if (!html) return [];

    const { document } = parseHTML(html);

    const results: string[] = [];
    document.querySelectorAll(".result__url").forEach((el) => {
      const text = el.textContent?.trim();
      if (text) {
        const normalized = text.startsWith("http") ? text : `https://${text}`;
        try {
          new URL(normalized); // validate
          results.push(normalized);
        } catch {}
      }
    });

    return [...new Set(results)].slice(0, maxResults);
  }

  discoverFeeds = async (input: string): Promise<DiscoveredFeed[]> => {
    const trimmed = input.trim();

    try {
      if (isUrl(trimmed)) {
        const normalizedUrl = this.normalizeUrl(trimmed);
        const html = await this.safeFetch(normalizedUrl);
        if (!html) throw new Error(`Failed to fetch ${normalizedUrl}`);

        return this.extractFeedLinks(html, normalizedUrl, true);
      } else {
        // Search mode: query DDG, get top 3 sites, extract feeds from each
        const siteUrls = await this.searchDuckDuckGo(trimmed);
        const allFeeds: DiscoveredFeed[] = [];
        const seen = new Set<string>();

        for (const siteUrl of siteUrls) {
          try {
            const site = await this.safeFetch(siteUrl);
            if (!site) continue;

            const parsedFeed = this.tryParseFeed(site);
            if (parsedFeed) {
              if (!seen.has(siteUrl)) {
                seen.add(siteUrl);
                allFeeds.push({
                  title: parsedFeed.channel.title,
                  url: siteUrl,
                  type: parsedFeed.feedType,
                });
              }
              continue;
            }

            const feeds = await this.extractFeedLinks(site, siteUrl);
            for (const feed of feeds) {
              if (!seen.has(feed.url)) {
                seen.add(feed.url);
                allFeeds.push(feed);
              }
            }
          } catch {}
        }

        return allFeeds;
      }
    } catch (error) {
      console.error("[FeedDiscovery] error:", error);
      throw new Error(`Error discovering feeds: ${error}`);
    }
  };

  private async extractFeedLinks(
    html: string,
    baseUrl: string,
    guessPaths?: boolean,
  ): Promise<DiscoveredFeed[]> {
    const { document } = parseHTML(html);
    const feeds = new Set<string>();

    // 1. RSS search for <link rel="alternate"> in the page
    document.querySelectorAll("link[rel='alternate']").forEach((el) => {
      const type = el.getAttribute("type") ?? "";
      const href = el.getAttribute("href") ?? "";
      if (href && /(rss|atom|xml)/i.test(type)) {
        feeds.add(new URL(href, baseUrl).href);
      }
    });

    // 2. search for suspicious <a href>
    document.querySelectorAll("a[href]").forEach((el) => {
      const href = el.getAttribute("href") ?? "";
      if (href && /(rss|feed|atom)/i.test(href)) {
        try {
          feeds.add(new URL(href, baseUrl).href);
        } catch {}
      }
    });

    if (guessPaths) {
      // 3 — test common feed paths
      for (const path of COMMON_PATHS) {
        const candidate = new URL(path, baseUrl).href;
        if ((await this.checkFeed(candidate)).valid) {
          feeds.add(candidate);
        }
      }

      // 4 — sitemap
      const SITEMAP_PATHS = [
        "/sitemap.xml",
        "/sitemap_index.xml",
        "/sitemap-index.xml",
        "/sitemap/sitemap.xml",
        "/news-sitemap.xml",
        "/sitemap-news.xml",
        "/sitemap1.xml",
        "/wp-sitemap.xml",
      ];

      for (const sitemapPath of SITEMAP_PATHS) {
        try {
          const sitemapURL = new URL(sitemapPath, baseUrl).href;
          const xml = await this.safeFetch(sitemapURL);
          if (!xml) continue;
          const data = this.xmlParser.parse(xml);
          const urls: string[] =
            data?.urlset?.url?.map((u: { loc: string }) => u.loc) ??
            data?.sitemapindex?.sitemap?.map((s: { loc: string }) => s.loc) ??
            [];
          for (const u of urls) {
            if (/(rss|feed|atom)/i.test(u)) feeds.add(u);
          }
        } catch {}
      }
    }

    // 5 — validate feeds
    const feedUrls = Array.from(feeds).slice(0, 10); // limit to 10 candidates
    const results = await Promise.all(
      feedUrls.map(async (url) => {
        const { valid, title } = await this.checkFeed(url);
        return { url, valid, title };
      }),
    );
    const validFeeds: DiscoveredFeed[] = results
      .filter((r) => r.valid)
      .map((r) => ({ title: r.title ?? r.url, url: r.url, type: "" }));

    return validFeeds;
  }

  private normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
}

export const feedDiscoveryService = new FeedDiscoveryService(fetch);
