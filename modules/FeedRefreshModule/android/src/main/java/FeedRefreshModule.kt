package com.ggsalas.noticiosoandroid.feedrefresh

import android.content.Context
import com.ggsalas.noticiosoandroid.feedrefresh.articles.ArticleDownloadWorker
import com.ggsalas.noticiosoandroid.feedrefresh.articles.ArticleDownloader
import com.ggsalas.noticiosoandroid.feedrefresh.articles.ArticleGarbageCollector
import com.ggsalas.noticiosoandroid.feedrefresh.articles.ArticleProgressEvents
import com.ggsalas.noticiosoandroid.feedrefresh.articles.OnDemandDownloads
import com.ggsalas.noticiosoandroid.feedrefresh.db.ArticleJobStore
import com.ggsalas.noticiosoandroid.feedrefresh.db.NoticiosoDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.FeedRefreshRunner
import com.ggsalas.noticiosoandroid.feedrefresh.worker.SerialWorker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicReference

/**
 * Expo module: the JS-facing API of the native data pipeline.
 *
 * This file only defines functions and events and delegates the work:
 *   worker/   SerialWorker — one thread runs everything, in order
 *   feeds/    fetch + parse feeds into a new generation
 *   articles/ download article HTML + metadata, garbage collection
 *   db/       SQLite access (database shared with JS)
 */
class FeedRefreshModule : Module(), ArticleProgressEvents {
    companion object {
        // Returned by refreshFeeds when the refresh was queued behind running work
        const val FEED_REFRESH_QUEUED = "Feed refresh queued"

        private const val TAG = "FeedRefreshModule"
    }

    private val worker = SerialWorker(onIdle = { emit("onArticleWorkerIdle", emptyMap()) })

    // A queued feed refresh always runs with the most recent feed list requested
    private val latestRequestedFeeds = AtomicReference<List<Map<String, Any>>?>(null)

    override fun definition() = ModuleDefinition {
        Name("FeedRefreshModule")

        Events(
            "onArticleDownloadFeedStarted",
            "onArticleDownloadFeedComplete",
            "onFeedRefreshStarted",
            "onFeedRefreshFinished",
            "onArticleWorkerIdle"
        )

        /**
         * Fetch + parse all feeds into a new generation, then download its articles.
         * - Worker idle: runs now; resolves with the feed-pass summary.
         * - Worker busy: the refresh is queued (never dropped) and resolves with
         *   FEED_REFRESH_QUEUED immediately. Completion arrives via `onFeedRefreshFinished`.
         */
        AsyncFunction("refreshFeeds") { feeds: List<Map<String, Any>> ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"
            latestRequestedFeeds.set(feeds)

            val wasBusy = worker.isBusy
            val future = worker.submitOnce("feedRefresh") {
                runFeedRefresh(latestRequestedFeeds.getAndSet(null) ?: emptyList(), context)
            }
                // One is already waiting; it will pick up the latest feed list
                ?: return@AsyncFunction FEED_REFRESH_QUEUED

            if (wasBusy) FEED_REFRESH_QUEUED else (future.get() ?: "No result")
        }

        // Synchronous check used by JS as a safety net for lost events
        Function("isWorkerBusy") {
            worker.isBusy
        }

        // Resume article downloads interrupted by process death
        AsyncFunction("reconcileArticleDownloads") { ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"

            val wasBusy = worker.isBusy
            worker.submitOnce("reconcile") {
                android.util.Log.i(TAG, "Processing reconciliation")
                val result = ArticleDownloadWorker(context, this@FeedRefreshModule).reconcileIncompleteJobs()
                android.util.Log.i(TAG, "Reconciliation complete: $result")
                result
            } ?: return@AsyncFunction "Reconciliation already queued"

            if (wasBusy) "Reconciliation enqueued" else "Reconciliation started"
        }

        /**
         * Drop every generation except active/pending, plus article metadata + HTML
         * no kept snapshot references. Safe to call repeatedly (idempotent).
         */
        AsyncFunction("collectGarbage") { ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"

            worker.submitOnce("gc") {
                OnDemandDownloads.exclusively { protectedUrls ->
                    NoticiosoDatabase.open(context).use { db ->
                        val result = ArticleGarbageCollector(context).collect(db, protectedUrls)
                        android.util.Log.i(TAG, "Garbage collection: $result")
                        result
                    }
                }
            } ?: return@AsyncFunction "Garbage collection already queued"

            "Garbage collection queued"
        }

        /**
         * Download ONE article now (the user opened it and it is not cached).
         * Same code path as the bulk download (HTML via temp file + atomic rename,
         * metadata to SQLite) but NOT queued on the serial worker, so the reader
         * never waits behind a bulk download. Rejects if the download fails.
         */
        AsyncFunction("downloadArticle") { url: String ->
            val context = appContext.reactContext ?: throw IllegalStateException("No context")

            OnDemandDownloads.download(url) {
                NoticiosoDatabase.open(context).use { db ->
                    ArticleDownloader(context, onDemand = true).downloadAndPersist(url, ArticleJobStore(db))
                }
            }
        }

        // Clear all article download jobs (used by StorageService.clearCaches)
        AsyncFunction("clearArticleDownloadJobs") { ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"
            try {
                NoticiosoDatabase.open(context).use { db -> ArticleJobStore(db).deleteAllJobs() }
                android.util.Log.i(TAG, "Cleared all article download jobs")
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Failed to clear article download jobs", e)
                throw e
            }
        }
    }

    /** Runs ON the worker thread: feed pass, then queue the article download behind it. */
    private fun runFeedRefresh(feeds: List<Map<String, Any>>, context: Context): String {
        if (feeds.isEmpty()) return "No feeds configured"

        emit("onFeedRefreshStarted", mapOf("feedCount" to feeds.size))
        val result = FeedRefreshRunner(context).run(feeds)

        result.refreshId?.let { refreshId ->
            worker.submit {
                android.util.Log.i(TAG, "Processing article download for refresh $refreshId")
                val summary = ArticleDownloadWorker(context, this).downloadArticlesForRefresh(refreshId)
                android.util.Log.i(TAG, "Article download complete for refresh $refreshId: $summary")
                summary
            }
        }

        emit("onFeedRefreshFinished", mapOf("refreshId" to result.refreshId, "result" to result.summary))
        return result.summary
    }

    // ---- events (best-effort: SQLite + files are the source of truth) ----

    private fun emit(name: String, body: Map<String, Any?>) {
        try {
            sendEvent(name, body)
        } catch (e: Exception) {
            // Never fail the work because a notification could not be delivered
        }
    }

    override fun feedStarted(refreshId: String, feedCount: Int, articleCount: Int) {
        emit(
            "onArticleDownloadFeedStarted",
            mapOf("refreshId" to refreshId, "feedCount" to feedCount, "articleCount" to articleCount)
        )
    }

    override fun feedCompleted(
        refreshId: String,
        feedUrl: String,
        feedIndex: Int,
        feedCount: Int,
        articleCount: Int,
        articleSuccessCount: Int,
        articleFailedCount: Int
    ) {
        emit(
            "onArticleDownloadFeedComplete",
            mapOf(
                "refreshId" to refreshId,
                "feedUrl" to feedUrl,
                "feedIndex" to feedIndex,
                "feedCount" to feedCount,
                "articleCount" to articleCount,
                "articleSuccessCount" to articleSuccessCount,
                "articleFailedCount" to articleFailedCount
            )
        )
    }
}
