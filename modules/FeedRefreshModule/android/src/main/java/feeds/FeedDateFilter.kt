package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Keep items published within the last `oldestArticle` days.
 * Items with an empty or unparseable date are kept.
 */
fun filterFeedItemsByDate(
    items: List<FeedContentItem>,
    oldestArticle: Int,
    now: Date = Date()
): List<FeedContentItem> {
    val threshold = Calendar.getInstance().apply {
        time = now
        add(Calendar.DAY_OF_YEAR, -oldestArticle)
    }.time

    val dateFormat = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US)
    val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)

    return items.filter { item ->
        if (item.pubDate.isEmpty()) return@filter true

        try {
            val itemDate = try {
                dateFormat.parse(item.pubDate)
            } catch (e: Exception) {
                try {
                    isoFormat.parse(item.pubDate)
                } catch (e: Exception) {
                    null
                }
            }

            itemDate == null || itemDate.after(threshold)
        } catch (e: Exception) {
            true
        }
    }
}
