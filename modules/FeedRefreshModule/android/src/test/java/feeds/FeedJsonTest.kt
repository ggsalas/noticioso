package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedJsonTest {
    private fun item(title: String, link: String, content: String? = null) =
        FeedContentItem(title = title, link = link, pubDate = "2026-11-10", author = "A", description = "d", contentEncoded = content)

    private fun feed(vararg items: FeedContentItem) = FeedData(
        date = "2026-11-10T00:00:00.000Z",
        feedType = "rss",
        channel = Channel("Title", "Desc", "en", "https://example.com", "today", items.toList())
    )

    @Test
    fun serializesTheShapeJsReads() {
        val json = JSONObject(serializeFeedData(feed(item("One", "https://example.com/1", "body"))))

        assertEquals("rss", json.getString("feedType"))
        val channel = json.getJSONObject("rss").getJSONObject("channel")
        assertEquals("Title", channel.getString("title"))
        val first = channel.getJSONArray("item").getJSONObject(0)
        assertEquals("One", first.getString("title"))
        assertEquals("https://example.com/1", first.getString("link"))
        assertEquals("body", first.getString("content:encoded"))
    }

    @Test
    fun escapesQuotesBackslashesAndNewlines() {
        val tricky = "He said \"hi\" \\ and\nleft\ttabs"
        val json = JSONObject(serializeFeedData(feed(item(tricky, "https://example.com/1"))))

        val title = json.getJSONObject("rss").getJSONObject("channel").getJSONArray("item").getJSONObject(0).getString("title")
        assertEquals(tricky, title)
    }

    @Test
    fun extractsHttpLinksFromWhatItSerializes() {
        val json = serializeFeedData(
            feed(
                item("One", "https://example.com/1"),
                item("Two", "http://example.com/2"),
                item("No link", ""),
                item("Not http", "ftp://example.com/3")
            )
        )

        assertEquals(listOf("https://example.com/1", "http://example.com/2"), extractArticleLinks(json))
    }

    @Test
    fun emptyFeedHasNoLinks() {
        assertTrue(extractArticleLinks(serializeFeedData(feed()))!!.isEmpty())
        assertTrue(extractArticleLinks("{}")!!.isEmpty())
    }

    @Test
    fun unparseableJsonIsReportedAsUnknownNotEmpty() {
        // The garbage collector relies on null to avoid deleting articles
        assertNull(extractArticleLinks("not json"))
    }
}
