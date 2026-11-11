package com.ggsalas.noticiosoandroid.feedrefresh.articles

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.db.ArticleJobStore
import com.ggsalas.noticiosoandroid.feedrefresh.db.NoticiosoDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.db.RefreshStore
import com.ggsalas.noticiosoandroid.feedrefresh.db.Timestamps
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.extractArticleLinks

/**
 * Downloads the articles of a refresh generation.
 *
 * For a generation: collect article URLs from its feed snapshots, dedupe them
 * (the first feed that lists a URL owns it), create one job per URL and process
 * the unfinished jobs serially. Job state is persisted, so an interrupted run is
 * resumed by [reconcileIncompleteJobs]. Failed jobs are never retried.
 *
 * Must run on the module's serial worker (one instance of this work at a time).
 * Opens its own DB connection per call.
 */
class ArticleDownloadWorker(
    private val context: Context,
    private val events: ArticleProgressEvents
) {
    private val downloader = ArticleDownloader(context)

    /** Download the articles of a generation right after its feed pass. */
    fun downloadArticlesForRefresh(refreshId: String): String {
        ArticleFiles.deleteTempFiles(context)

        return NoticiosoDatabase.open(context).use { db ->
            processGeneration(refreshId, db)
        }
    }

    /**
     * Resume interrupted work (app start / foreground).
     *
     * Candidates are generations with unfinished jobs plus the active and pending
     * ones (which may have zero jobs if the process died before creating them).
     * Relevant generations with work left are resumed; jobs of generations that
     * are no longer active/pending are marked as superseded.
     */
    fun reconcileIncompleteJobs(): String {
        return NoticiosoDatabase.open(context).use { db ->
            val refreshes = RefreshStore(db)
            val jobs = ArticleJobStore(db)

            val candidates = linkedSetOf<String>()
            candidates.addAll(jobs.refreshIdsWithIncompleteJobs())
            refreshes.activeRefreshId()?.let { candidates.add(it) }
            refreshes.pendingRefreshId()?.let { candidates.add(it) }

            val processed = mutableListOf<String>()
            val obsolete = mutableListOf<String>()

            for (refreshId in candidates) {
                if (!refreshes.isStillRelevant(refreshId)) {
                    jobs.failIncompleteAsSuperseded(refreshId)
                    obsolete.add(refreshId)
                    continue
                }

                // Every job already reached a terminal state: nothing to do, and
                // no progress events (keeps app open / foreground a cheap no-op).
                if (!jobs.hasPendingWork(refreshId)) continue

                processed.add("$refreshId: ${processGeneration(refreshId, db)}")
            }

            val parts = mutableListOf<String>()
            if (processed.isNotEmpty()) parts.add("Processed: ${processed.joinToString("; ")}")
            if (obsolete.isNotEmpty()) parts.add("Obsolete: ${obsolete.joinToString(", ")}")
            if (parts.isEmpty()) "No incomplete jobs found" else parts.joinToString(" | ")
        }
    }

    /** What to download for a generation. */
    private class Plan(
        val feeds: List<String>,                      // feeds with articles, configured order
        val urlsByFeed: Map<String, List<String>>,    // every URL each feed lists
        val primaryByFeed: Map<String, List<String>>, // deduped: URLs each feed owns
        val articleCount: Int
    )

    private fun plan(refreshId: String, refreshes: RefreshStore): Plan {
        val feeds = refreshes.feedUrls(refreshId)
        val urlsByFeed = mutableMapOf<String, List<String>>()
        val primaryByFeed = linkedMapOf<String, List<String>>()
        val seen = mutableSetOf<String>()

        for (feedUrl in feeds) {
            val urls = refreshes.snapshotJson(refreshId, feedUrl)
                ?.let { extractArticleLinks(it) }
                ?: emptyList()
            urlsByFeed[feedUrl] = urls

            // First feed to list a URL becomes its owner
            val primary = urls.filter { it !in seen }
            if (primary.isNotEmpty()) {
                primaryByFeed[feedUrl] = primary
                seen.addAll(primary)
            }
        }

        // A feed without articles (e.g. its fetch failed and it has no previous
        // snapshot) has nothing to download and does not count in the progress.
        return Plan(feeds.filter { urlsByFeed[it]!!.isNotEmpty() }, urlsByFeed, primaryByFeed, seen.size)
    }

    private fun processGeneration(refreshId: String, db: SQLiteDatabase): String {
        val refreshes = RefreshStore(db)
        val jobs = ArticleJobStore(db)

        val plan = plan(refreshId, refreshes)
        // No events: the worker's idle event ends the progress in the UI
        if (plan.feeds.isEmpty()) {
            return "No articles found"
        }

        events.feedStarted(refreshId, plan.feeds.size, plan.articleCount)

        val createdAt = Timestamps.nowIso()
        for ((feedUrl, urls) in plan.primaryByFeed) {
            for (url in urls) {
                jobs.createIfMissing(refreshId, url, feedUrl, createdAt)
            }
        }

        // Feed by feed, in configured order, reporting each one as soon as it is
        // done. A URL shared with an earlier feed was already downloaded by it.
        var totalSuccess = 0
        var totalFailed = 0
        for ((index, feedUrl) in plan.feeds.withIndex()) {
            for (url in plan.primaryByFeed[feedUrl] ?: emptyList()) {
                // Checked before every article so we stop promptly when a newer
                // generation replaces this one mid-run (toast apply / new refresh).
                if (!refreshes.isStillRelevant(refreshId)) {
                    jobs.failIncompleteAsSuperseded(refreshId)
                    return "Interrupted: refresh superseded"
                }

                // Only unfinished jobs: completed ones are done, failed ones are not retried
                val status = jobs.status(refreshId, url)
                if (status != "pending" && status != "downloading") continue

                try {
                    processArticle(refreshId, url, jobs)
                } catch (e: Exception) {
                    jobs.markFailed(refreshId, url, e.message ?: "Unknown error")
                }
            }

            val urls = plan.urlsByFeed[feedUrl] ?: emptyList()
            var success = 0
            var failed = 0
            for (url in urls) {
                when (jobs.status(refreshId, url)) {
                    "completed" -> success++
                    "failed" -> failed++
                }
            }
            totalSuccess += success
            totalFailed += failed

            events.feedCompleted(refreshId, feedUrl, index + 1, plan.feeds.size, urls.size, success, failed)
        }

        return "Downloaded $totalSuccess articles, $totalFailed failed"
    }

    private fun processArticle(refreshId: String, url: String, jobs: ArticleJobStore) {
        jobs.markDownloading(refreshId, url)
        // Downloads only what is missing (file and/or metadata)
        val filePath = downloader.downloadAndPersist(url, jobs)
        jobs.markCompleted(refreshId, url, filePath)
    }
}
