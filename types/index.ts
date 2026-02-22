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

export type FeedData = {
  date: Date;
  rss: {
    channel: Channel;
  };
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
