import { Readability } from "@mozilla/readability";
import { router } from "expo-router";

type ReadabilityArticle = ReturnType<Readability["parse"]>;

export type Article = ReadabilityArticle;

export type OldestArticle = 1 | 7;

export type Feed = {
  id: string;
  name: string;
  url: string;
  oldestArticle: OldestArticle;
  lang: "en" | "es";
};

export type NewFeed = Feed & {
  isNew?: boolean;
};

export type Navigation = {
  nextUrl: string;
  prevUrl: string;
  currentFeed?: string;
};

export type FeedContentItem = {
  title: string;
  link: string;
  pubDate: string;
  author?: string;
  description: string; // can have images
  "content:encoded"?: string; // can have images
  /* guid
   *
   * media:description
   * media:credit
   * content:encoded
   */
};

export type FeedContent = FeedContentItem[];

export type Channel = {
  title: string;
  description: string;
  language: string;
  link: string;
  lastBuildDate: string;
  item: FeedContent;
};

// RSS feed structure
export type RSSFeed = {
  rss: {
    channel: Channel;
  };
};

// Atom feed structure
export type AtomFeed = {
  feed: {
    title: string;
    subtitle?: string;
    link?: string | { href: string } | Array<{ href: string }>;
    updated?: string;
    entry: FeedContentItem[];
  };
};

// RDF feed structure
export type RDFeed = {
  "rdf:RDF": {
    channel: Channel;
  };
};

// Union of all supported feed formats
export type ParsedFeed = RSSFeed | AtomFeed | RDFeed;

// Detect which type of feed this is
export type FeedType = "rss" | "atom" | "rdf" | "unknown";

export type FeedData = {
  date: Date;
  rss: {
    channel: Channel;
  };
  feedType: FeedType;
};

// UI

export type Pages = {
  amount: number;
  current: number;
  scrollLeft: number;
  isFirst: boolean;
  isLast: boolean;
};

export type HTMLPagesNavActionItem = {
  label: string;
  action: () => void;
};

export type HTMLPagesNavActions = {
  top?: HTMLPagesNavActionItem;
  bottom?: HTMLPagesNavActionItem;
  first: HTMLPagesNavActionItem;
  last: HTMLPagesNavActionItem;
};

export type HandleLinkData = {
  href: string;
};

export type HandleRouterLinkData = {
  path: Parameters<typeof router.navigate>[0];
};
