package com.ggsalas.noticiosoandroid.feedrefresh.feeds

/**
 * The feed snapshot JSON stored in `feed_snapshots.data`.
 * This format is a CONTRACT with JS (`FeedData` in types/index.ts): JS reads
 * what serializeFeedData writes. Writer and reader live together on purpose.
 */
fun serializeFeedData(feedData: FeedData): String {
    val items = feedData.channel.item.joinToString(",") { item ->
        """{
            "title": ${escapeJson(item.title)},
            "link": ${escapeJson(item.link)},
            "pubDate": ${escapeJson(item.pubDate)},
            "author": ${escapeJson(item.author)},
            "description": ${escapeJson(item.description)},
            "content:encoded": ${escapeJson(item.contentEncoded ?: "")}
        }"""
    }

    return """{
        "date": ${escapeJson(feedData.date)},
        "feedType": ${escapeJson(feedData.feedType)},
        "rss": {
            "channel": {
                "title": ${escapeJson(feedData.channel.title)},
                "description": ${escapeJson(feedData.channel.description)},
                "language": ${escapeJson(feedData.channel.language)},
                "link": ${escapeJson(feedData.channel.link)},
                "lastBuildDate": ${escapeJson(feedData.channel.lastBuildDate)},
                "item": [$items]
            }
        }
    }"""
}

private fun escapeJson(str: String): String {
    return "\"" + str
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t") + "\""
}

/**
 * Extract article links (http/https) from a normalized feed snapshot JSON
 * (`{"rss":{"channel":{"item":[{"link":"..."}]}}}`).
 *
 * Returns null when the JSON cannot be parsed, so callers can tell
 * "no articles" apart from "unknown references" (GC must not delete on unknown).
 */
fun extractArticleLinks(jsonData: String): List<String>? {
    return try {
        val links = mutableListOf<String>()
        val items = org.json.JSONObject(jsonData)
            .optJSONObject("rss")
            ?.optJSONObject("channel")
            ?.optJSONArray("item")
            ?: return links

        for (i in 0 until items.length()) {
            val link = items.optJSONObject(i)?.optString("link", "")?.trim() ?: continue
            if (link.startsWith("http://") || link.startsWith("https://")) {
                links.add(link)
            }
        }
        links
    } catch (e: Exception) {
        null
    }
}
