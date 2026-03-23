import type {
  ParsedFeed,
  RSSFeed,
  AtomFeed,
  RDFeed,
  FeedType,
  Channel,
} from "~/types";

/**
 * Detects the type of feed (RSS, Atom, RDF) from the parsed XML data
 */
export function detectFeedType(data: unknown): FeedType {
  if (!data || typeof data !== "object") {
    return "unknown";
  }

  const obj = data as Record<string, unknown>;

  if (obj.rss !== undefined) {
    return "rss";
  }

  if (obj.feed !== undefined) {
    return "atom";
  }

  if (obj["rdf:RDF"] !== undefined) {
    return "rdf";
  }

  return "unknown";
}

/**
 * Normalizes different feed formats to a common Channel structure
 * @throws Error if the feed format is not supported
 */
export function normalizeToChannel(data: ParsedFeed): Channel {
  // Handle RSS
  if ("rss" in data) {
    return (data as RSSFeed).rss.channel;
  }

  // Handle Atom - normalize to channel format
  if ("feed" in data) {
    const atomFeed = (data as AtomFeed).feed;
    return {
      title: atomFeed.title || "Unknown",
      description: atomFeed.subtitle || "",
      language: "",
      link: normalizeAtomLink(atomFeed.link),
      lastBuildDate: atomFeed.updated || "",
      item: atomFeed.entry || [],
    };
  }

  // Handle RDF
  if ("rdf:RDF" in data) {
    return (data as RDFeed)["rdf:RDF"].channel;
  }

  throw new Error("Unsupported feed format");
}

/**
 * Normalizes Atom link to a simple string URL
 */
function normalizeAtomLink(
  link?: string | { href: string } | { href: string }[],
): string {
  if (!link) {
    return "";
  }

  if (typeof link === "string") {
    return link;
  }

  if (Array.isArray(link)) {
    return link[0]?.href || "";
  }

  return link.href || "";
}
