package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import android.content.Context
import com.ggsalas.noticiosoandroid.feedrefresh.db.NoticiosoDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.db.RefreshStore
import com.ggsalas.noticiosoandroid.feedrefresh.db.Timestamps
import java.util.UUID

/**
 * One feed pass: fetch + parse every feed into a NEW generation and make it the
 * pending one (the user keeps seeing the active generation until the toast is
 * applied).
 *
 * - A failed feed is recorded as failed and keeps its last good snapshot
 *   (carried forward from the active generation). No automatic retries.
 * - A previous unapplied pending generation is superseded.
 *
 * Must run on the module's serial worker.
 */
class FeedRefreshRunner(private val context: Context) {

    /** refreshId is null when the pass failed before producing a generation. */
    class Result(val refreshId: String?, val summary: String)

    fun run(feeds: List<Map<String, Any>>): Result {
        return try {
            NoticiosoDatabase.open(context).use { db ->
                val store = RefreshStore(db)
                val refreshId = UUID.randomUUID().toString()
                store.createBuilding(refreshId, Timestamps.nowIso())

                var successCount = 0
                val failedFeedUrls = mutableListOf<String>()

                for ((position, feedMap) in feeds.withIndex()) {
                    try {
                        val feed = Feed(
                            id = feedMap["id"] as? String ?: continue,
                            name = feedMap["name"] as? String ?: continue,
                            url = feedMap["url"] as? String ?: continue,
                            oldestArticle = (feedMap["oldestArticle"] as? Number)?.toInt() ?: 7,
                            lang = feedMap["lang"] as? String ?: "en"
                        )

                        val feedData = fetchAndParseFeed(feed)
                        val now = Timestamps.nowIso()
                        if (feedData != null) {
                            store.insertSnapshot(refreshId, feed.url, serializeFeedData(feedData), now)
                            store.recordFeedSuccess(refreshId, feed.url, feedData.channel.item.size, position, now)
                            successCount++
                        } else {
                            store.recordFeedFailure(refreshId, feed.url, "Failed to fetch or parse feed", position, now)
                            failedFeedUrls.add(feed.url)
                        }
                    } catch (e: Exception) {
                        val feedUrl = feedMap["url"] as? String ?: "unknown"
                        store.recordFeedFailure(refreshId, feedUrl, e.message ?: "Unknown error", position, Timestamps.nowIso())
                        failedFeedUrls.add(feedUrl)
                    }
                }

                // Failed feeds keep showing their last good content
                store.activeRefreshId()?.let { activeId ->
                    failedFeedUrls.forEach { store.carryForwardSnapshot(activeId, refreshId, it) }
                }

                store.markReadyAsPending(refreshId, Timestamps.nowIso())

                Result(refreshId, "$successCount feeds downloaded successfully, ${failedFeedUrls.size} failed")
            }
        } catch (e: Exception) {
            android.util.Log.e("FeedRefreshModule", "Feed refresh failed", e)
            Result(null, "Error: ${e.message}")
        }
    }
}
