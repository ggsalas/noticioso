package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import java.text.SimpleDateFormat
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class FeedDateFilterTest {
    private val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss Z", Locale.US).parse("2026-11-10T12:00:00 +0000")!!

    private fun item(pubDate: String) =
        FeedContentItem(title = pubDate, link = "https://e.com", pubDate = pubDate, author = "", description = "", contentEncoded = null)

    private fun kept(oldestArticle: Int, vararg dates: String): List<String> =
        filterFeedItemsByDate(dates.map { item(it) }, oldestArticle, now).map { it.pubDate }

    @Test
    fun keepsItemsInsideTheWindowAndDropsOlderOnes() {
        val recent = "Tue, 10 Nov 2026 06:00:00 +0000"   // 6h old
        val old = "Sun, 08 Nov 2026 06:00:00 +0000"      // 2d 6h old

        assertEquals(listOf(recent), kept(1, recent, old))
        assertEquals(listOf(recent, old), kept(7, recent, old))
    }

    @Test
    fun understandsIsoDates() {
        val recent = "2026-11-10T06:00:00"
        val old = "2026-11-01T06:00:00"

        assertEquals(listOf(recent), kept(1, recent, old))
    }

    @Test
    fun keepsItemsWithEmptyOrUnparseableDates() {
        assertEquals(listOf("", "not a date"), kept(1, "", "not a date"))
    }
}
