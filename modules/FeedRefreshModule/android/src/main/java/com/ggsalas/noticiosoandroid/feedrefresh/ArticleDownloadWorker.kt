package com.ggsalas.noticiosoandroid.feedrefresh

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import expo.modules.kotlin.modules.Module
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Orchestrates native article downloading after feed refresh completes.
 *
 * Process:
 * 1. Collect all article URLs from feed_snapshots for the refresh
 * 2. Dedupe by URL
 * 3. Create download jobs in article_download_jobs table
 * 4. Process each article serially (check file + metadata, download if needed)
 * 5. Update job status throughout
 * 6. Emit events when feeds complete
 *
 * Designed to be resilient to interruptions - persists job state for reconciliation.
 * Opens its own DB connection so it can run independently of the feed refresh.
 */
class ArticleDownloadWorker(
    private val context: Context,
    private val module: Module
) {
    private val isRunning = AtomicBoolean(false)
    private val downloader = ArticleDownloader(context)

    /**
     * Start article download for a refresh.
     * Opens its own DB connection and closes it when done.
     *
     * @param refreshId The refresh ID to process articles for
     * @return Summary of download results
     */
    fun downloadArticlesForRefresh(refreshId: String): String {
        if (!isRunning.compareAndSet(false, true)) {
            return "Article download already in progress"
        }

        // Clean orphan temp files at worker start
        cleanOrphanTempFiles()

        val db = getDatabase()
        try {
            // Collect all feeds from refresh_feeds in configured order
            val allFeeds = collectAllFeeds(refreshId, db)
            if (allFeeds.isEmpty()) {
                return "No feeds found for refresh $refreshId"
            }

            // Track all URLs per feed and primary ownership for deduplication
            val feedAllUrls = mutableMapOf<String, List<String>>()
            val feedPrimaryUrls = mutableMapOf<String, List<String>>()
            val allUrls = mutableSetOf<String>()

            for (feedUrl in allFeeds) {
                val articles = if (hasSnapshot(refreshId, feedUrl, db)) {
                    collectArticleUrls(refreshId, feedUrl, db)
                } else {
                    emptyList()
                }
                feedAllUrls[feedUrl] = articles

                // First feed to claim a URL becomes its primary owner
                val primary = articles.filter { it !in allUrls }
                if (primary.isNotEmpty()) {
                    feedPrimaryUrls[feedUrl] = primary
                    allUrls.addAll(primary)
                }
            }

            if (allUrls.isEmpty()) {
                // Still emit completion events for all feeds with zero counts
                for ((index, feedUrl) in allFeeds.withIndex()) {
                    emitFeedCompletionEvent(refreshId, feedUrl, index + 1, allFeeds.size, 0, 0, 0)
                }
                return "No articles found for refresh $refreshId"
            }

            // Emit start event before processing articles
            emitFeedStartedEvent(refreshId, allFeeds.size, allUrls.size)

            // Create download jobs for primary URLs only
            val createdAt = currentTimestamp()
            for ((feedUrl, urls) in feedPrimaryUrls) {
                for (url in urls) {
                    createJobIfNotExists(url, refreshId, feedUrl, createdAt, db)
                }
            }

            // Process all primary URLs
            for ((feedUrl, urls) in feedPrimaryUrls) {
                // Check relevance before processing each feed
                // (catches case where refresh becomes superseded during processing)
                if (!isRefreshStillRelevant(refreshId, db)) {
                    db.execSQL(
                        "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
                        arrayOf(refreshId)
                    )
                    return "Download interrupted: refresh superseded"
                }

                for (url in urls) {
                    // Check relevance before each article so we stop promptly
                    // when a newer generation is applied mid-run (e.g. toast apply)
                    if (!isRefreshStillRelevant(refreshId, db)) {
                        db.execSQL(
                            "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
                            arrayOf(refreshId)
                        )
                        return "Download interrupted: refresh superseded"
                    }
                    try {
                        processArticle(url, refreshId, db)
                    } catch (e: Exception) {
                        markJobFailed(url, refreshId, e.message ?: "Unknown error", db)
                    }
                }
            }

            // Emit completion for ALL feeds with outcome counts
            var totalSuccess = 0
            var totalFailed = 0

            for ((index, feedUrl) in allFeeds.withIndex()) {
                val urls = feedAllUrls[feedUrl] ?: emptyList()
                var feedSuccess = 0
                var feedFailed = 0

                for (url in urls) {
                    val status = getJobStatus(url, refreshId, db)
                    when (status) {
                        "completed" -> feedSuccess++
                        "failed" -> feedFailed++
                    }
                }

                totalSuccess += feedSuccess
                totalFailed += feedFailed

                emitFeedCompletionEvent(refreshId, feedUrl, index + 1, allFeeds.size, urls.size, feedSuccess, feedFailed)
            }

            return "Downloaded $totalSuccess articles, $totalFailed failed"
        } finally {
            db.close()
            isRunning.set(false)
        }
    }

    /**
     * Reconcile incomplete jobs on app foreground.
     *
     * Finds all refreshes that are currently active or pending (via pointers),
     * discovers any with incomplete jobs OR zero jobs (if process died before jobs inserted),
     * resumes them serially, and marks obsolete jobs for superseded generations.
     */
    fun reconcileIncompleteJobs(): String {
        if (!isRunning.compareAndSet(false, true)) {
            return "Reconciliation already in progress"
        }

        val db = getDatabase()
        var result = "No incomplete jobs found"

        try {
            // Collect candidate refresh IDs from multiple sources:
            // 1. Jobs with pending/downloading status (existing incomplete work)
            val jobRefreshIds = mutableListOf<String>()
            db.rawQuery(
                """SELECT DISTINCT refresh_id FROM article_download_jobs
                   WHERE status IN ('pending', 'downloading')
                   ORDER BY created_at DESC""",
                null
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    jobRefreshIds.add(cursor.getString(0))
                }
            }

            // 2. Active refresh pointer (currently applied)
            val activeRefreshId = db.rawQuery(
                "SELECT refresh_id FROM active_refresh WHERE id = 1",
                null
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }

            // 3. Pending refresh pointer (ready to be applied)
            val pendingRefreshId = db.rawQuery(
                "SELECT refresh_id FROM pending_refresh WHERE id = 1",
                null
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }

            // Dedupe: combine all sources, preserve order (jobs first, then pointers)
            val candidateRefreshIds = linkedSetOf<String>()
            candidateRefreshIds.addAll(jobRefreshIds)
            if (activeRefreshId != null) candidateRefreshIds.add(activeRefreshId)
            if (pendingRefreshId != null) candidateRefreshIds.add(pendingRefreshId)

            if (candidateRefreshIds.isEmpty()) {
                return result
            }

            val processedRefreshes = mutableListOf<String>()
            val obsoleteRefreshes = mutableListOf<String>()

            // Process each candidate refresh
            for (refreshId in candidateRefreshIds) {
                // Check pointer-based relevance: must be currently active or pending
                val isRelevant = isRefreshStillRelevant(refreshId, db)

                if (isRelevant) {
                    // Resume download for this refresh (creates jobs if missing)
                    val downloadResult = processRefreshArticles(refreshId, db)
                    processedRefreshes.add("$refreshId: $downloadResult")
                } else {
                    // Mark all jobs for this refresh as obsolete
                    db.execSQL(
                        "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
                        arrayOf(refreshId)
                    )
                    obsoleteRefreshes.add(refreshId)
                }
            }

            // Build result message
            val parts = mutableListOf<String>()
            if (processedRefreshes.isNotEmpty()) {
                parts.add("Processed: ${processedRefreshes.joinToString("; ")}")
            }
            if (obsoleteRefreshes.isNotEmpty()) {
                parts.add("Obsolete: ${obsoleteRefreshes.joinToString(", ")}")
            }

            result = if (parts.isEmpty()) "No incomplete jobs found" else parts.joinToString(" | ")

        } finally {
            db.close()
            isRunning.set(false)
        }

        return result
    }

    /**
     * Process articles for a refresh without acquiring the isRunning lock.
     * This is used by reconcileIncompleteJobs to avoid double-locking.
     */
    private fun processRefreshArticles(refreshId: String, db: SQLiteDatabase): String {
        // Collect all feeds from refresh_feeds in configured order
        val allFeeds = collectAllFeeds(refreshId, db)
        if (allFeeds.isEmpty()) {
            return "No feeds found"
        }

        // Track all URLs per feed and primary ownership for deduplication
        val feedAllUrls = mutableMapOf<String, List<String>>()
        val feedPrimaryUrls = mutableMapOf<String, List<String>>()
        val allUrls = mutableSetOf<String>()

        for (feedUrl in allFeeds) {
            val articles = if (hasSnapshot(refreshId, feedUrl, db)) {
                collectArticleUrls(refreshId, feedUrl, db)
            } else {
                emptyList()
            }
            feedAllUrls[feedUrl] = articles

            val primary = articles.filter { it !in allUrls }
            if (primary.isNotEmpty()) {
                feedPrimaryUrls[feedUrl] = primary
                allUrls.addAll(primary)
            }
        }

        if (allUrls.isEmpty()) {
            // Still emit completion events for all feeds with zero counts
            for ((index, feedUrl) in allFeeds.withIndex()) {
                emitFeedCompletionEvent(refreshId, feedUrl, index + 1, allFeeds.size, 0, 0, 0)
            }
            return "No articles found"
        }

        // Emit start event before processing articles
        emitFeedStartedEvent(refreshId, allFeeds.size, allUrls.size)

        // Create any missing jobs for primary URLs
        val createdAt = currentTimestamp()
        for ((feedUrl, urls) in feedPrimaryUrls) {
            for (url in urls) {
                createJobIfNotExists(url, refreshId, feedUrl, createdAt, db)
            }
        }

        // Process only incomplete primary jobs
        for ((feedUrl, urls) in feedPrimaryUrls) {
            // Check relevance before processing each feed
            // (catches case where refresh becomes superseded during reconciliation)
            if (!isRefreshStillRelevant(refreshId, db)) {
                db.execSQL(
                    "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
                    arrayOf(refreshId)
                )
                return "Reconciliation interrupted: refresh superseded"
            }

            for (url in urls) {
                // Check relevance before each article so we stop promptly
                // when a newer generation is applied mid-run (e.g. toast apply)
                if (!isRefreshStillRelevant(refreshId, db)) {
                    db.execSQL(
                        "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
                        arrayOf(refreshId)
                    )
                    return "Reconciliation interrupted: refresh superseded"
                }

                val statusCursor = db.rawQuery(
                    "SELECT status FROM article_download_jobs WHERE refresh_id = ? AND url = ?",
                    arrayOf(refreshId, url)
                )

                val shouldProcess = statusCursor.use {
                    it.moveToFirst() && it.getString(0) in listOf("pending", "downloading")
                }

                if (!shouldProcess) continue

                try {
                    processArticle(url, refreshId, db)
                } catch (e: Exception) {
                    markJobFailed(url, refreshId, e.message ?: "Unknown error", db)
                }
            }
        }

        // Emit completion for ALL feeds with outcome counts
        var totalSuccess = 0
        var totalFailed = 0

        for ((index, feedUrl) in allFeeds.withIndex()) {
            val urls = feedAllUrls[feedUrl] ?: emptyList()
            var feedSuccess = 0
            var feedFailed = 0

            for (url in urls) {
                val status = getJobStatus(url, refreshId, db)
                when (status) {
                    "completed" -> feedSuccess++
                    "failed" -> feedFailed++
                }
            }

            totalSuccess += feedSuccess
            totalFailed += feedFailed

            emitFeedCompletionEvent(refreshId, feedUrl, index + 1, allFeeds.size, urls.size, feedSuccess, feedFailed)
        }

        return "Downloaded $totalSuccess articles, $totalFailed failed"
    }

    private fun getDatabase(): SQLiteDatabase {
        // expo-sqlite default path: <filesDir>/SQLite/<dbname>
        val dbDir = File(context.filesDir, "SQLite")
        if (!dbDir.exists()) {
            dbDir.mkdirs()
        }
        val dbPath = File(dbDir, "noticioso.db")

        return try {
            SQLiteDatabase.openDatabase(
                dbPath.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY
            )
        } catch (e: Exception) {
            throw RuntimeException("Failed to open database at ${dbPath.absolutePath}", e)
        }
    }

    /**
     * Collect all feeds from refresh_feeds in configured order (by position).
     * This includes ALL feeds, not just those with snapshots.
     */
    private fun collectAllFeeds(refreshId: String, db: SQLiteDatabase): List<String> {
        val cursor = db.rawQuery(
            """SELECT feed_url FROM refresh_feeds
               WHERE refresh_id = ?
               ORDER BY position ASC""",
            arrayOf(refreshId)
        )

        return cursor.use {
            val urls = mutableListOf<String>()
            while (it.moveToNext()) {
                urls.add(it.getString(0))
            }
            urls
        }
    }

    /**
     * Check if a snapshot exists for a specific feed in a refresh.
     */
    private fun hasSnapshot(refreshId: String, feedUrl: String, db: SQLiteDatabase): Boolean {
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
            arrayOf(refreshId, feedUrl)
        )
        return cursor.use {
            it.moveToFirst() && it.getInt(0) > 0
        }
    }

    /**
     * Get the status of a download job for a specific URL and refresh.
     */
    private fun getJobStatus(url: String, refreshId: String, db: SQLiteDatabase): String? {
        val cursor = db.rawQuery(
            "SELECT status FROM article_download_jobs WHERE refresh_id = ? AND url = ?",
            arrayOf(refreshId, url)
        )
        return cursor.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    }

    private fun collectArticleUrls(
        refreshId: String,
        feedUrl: String,
        db: SQLiteDatabase
    ): List<String> {
        val cursor = db.rawQuery(
            "SELECT data FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
            arrayOf(refreshId, feedUrl)
        )

        val urls = mutableListOf<String>()

        cursor.use {
            if (it.moveToFirst()) {
                val jsonData = it.getString(0)
                // Parse JSON to extract article links
                // The data format is: {"rss":{"channel":{"item":[{"link":"..."}, ...]}}}
                // or {"feed":{"entry":[{"link":{"href":"..."}}, ...]}}
                val links = extractLinksFromJson(jsonData)
                urls.addAll(links)
            }
        }

        return urls
    }

    /**
     * Extract article links from normalized feed JSON using proper JSON parsing.
     * Only extracts links from rss.channel.item[] array to avoid including channel-level URLs.
     */
    private fun extractLinksFromJson(jsonData: String): List<String> {
        val links = mutableListOf<String>()

        try {
            val json = org.json.JSONObject(jsonData)
            val rss = json.optJSONObject("rss") ?: return links
            val channel = rss.optJSONObject("channel") ?: return links
            val items = channel.optJSONArray("item") ?: return links

            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                val link = item.optString("link", "").trim()

                // Filter blank and non-http(s) URLs
                if (link.isNotEmpty() && (link.startsWith("http://") || link.startsWith("https://"))) {
                    links.add(link)
                }
            }
        } catch (e: Exception) {
            // If parsing fails, return empty list
            android.util.Log.w("ArticleDownloadWorker", "Failed to parse feed JSON", e)
        }

        return links
    }

    private fun createJobIfNotExists(
        articleUrl: String,
        refreshId: String,
        feedUrl: String,
        createdAt: String,
        db: SQLiteDatabase
    ) {
        // Check if job already exists with compound key (refresh_id, url)
        val cursor = db.rawQuery(
            "SELECT status FROM article_download_jobs WHERE refresh_id = ? AND url = ?",
            arrayOf(refreshId, articleUrl)
        )

        val exists = cursor.use { it.moveToFirst() }

        if (!exists) {
            db.execSQL(
                """INSERT INTO article_download_jobs
                   (refresh_id, url, feed_url, status, created_at)
                   VALUES (?, ?, ?, 'pending', ?)""",
                arrayOf(refreshId, articleUrl, feedUrl, createdAt)
            )
        }
    }

    private fun processArticle(articleUrl: String, refreshId: String, db: SQLiteDatabase) {
        // Mark as downloading
        db.execSQL(
            "UPDATE article_download_jobs SET status = 'downloading' WHERE refresh_id = ? AND url = ?",
            arrayOf(refreshId, articleUrl)
        )

        // Check if already cached (file + metadata exist)
        val filePath = downloader.getFilePath(articleUrl)
        val fileExists = downloader.fileExists(articleUrl)
        val metadataExists = metadataExists(articleUrl, db)

        if (fileExists && metadataExists) {
            // Already cached, mark as completed
            markJobCompleted(articleUrl, refreshId, filePath, db)
            return
        }

        if (fileExists && !metadataExists) {
            // File exists but metadata missing, reconstruct
            downloader.ensureMetadataExists(articleUrl, java.io.File(filePath), db)
            markJobCompleted(articleUrl, refreshId, filePath, db)
            return
        }

        // Download and persist
        val finalPath = downloader.downloadAndPersist(articleUrl, db)
        markJobCompleted(articleUrl, refreshId, finalPath, db)
    }

    private fun metadataExists(url: String, db: SQLiteDatabase): Boolean {
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM article_metadata WHERE url = ?",
            arrayOf(url)
        )
        return cursor.use {
            it.moveToFirst() && it.getInt(0) > 0
        }
    }

    private fun markJobCompleted(articleUrl: String, refreshId: String, filePath: String, db: SQLiteDatabase) {
        val completedAt = currentTimestamp()
        db.execSQL(
            """UPDATE article_download_jobs
               SET status = 'completed', file_path = ?, completed_at = ?
               WHERE refresh_id = ? AND url = ?""",
            arrayOf(filePath, completedAt, refreshId, articleUrl)
        )
    }

    private fun markJobFailed(articleUrl: String, refreshId: String, errorMessage: String, db: SQLiteDatabase) {
        val completedAt = currentTimestamp()
        db.execSQL(
            """UPDATE article_download_jobs
               SET status = 'failed', error_message = ?, completed_at = ?
               WHERE refresh_id = ? AND url = ?""",
            arrayOf(errorMessage, completedAt, refreshId, articleUrl)
        )
    }

    private fun isRefreshStillRelevant(refreshId: String, db: SQLiteDatabase): Boolean {
        // A refresh is relevant only if it is currently pointed to by active_refresh or
        // pending_refresh. Using the pointer tables (not the state column) avoids
        // resuming work for a historical generation whose state was 'applied' before a
        // newer toast apply superseded it — the pointer moves atomically with the apply.
        val cursor = db.rawQuery(
            """SELECT 1 FROM (
                 SELECT refresh_id FROM active_refresh WHERE id = 1
                 UNION
                 SELECT refresh_id FROM pending_refresh WHERE id = 1
               ) WHERE refresh_id = ?""",
            arrayOf(refreshId)
        )
        return cursor.use { it.moveToFirst() }
    }

    private fun emitFeedStartedEvent(
        refreshId: String,
        feedCount: Int,
        articleCount: Int
    ) {
        try {
            module.sendEvent(
                "onArticleDownloadFeedStarted",
                mapOf(
                    "refreshId" to refreshId,
                    "feedCount" to feedCount,
                    "articleCount" to articleCount
                )
            )
        } catch (e: Exception) {
            // Event emission is best-effort, don't fail the download
        }
    }

    private fun emitFeedCompletionEvent(
        refreshId: String,
        feedUrl: String,
        feedIndex: Int,
        feedCount: Int,
        articleCount: Int,
        articleSuccessCount: Int,
        articleFailedCount: Int
    ) {
        try {
            module.sendEvent(
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
        } catch (e: Exception) {
            // Event emission is best-effort, don't fail the download
        }
    }

    private fun currentTimestamp(): String {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        dateFormat.timeZone = TimeZone.getTimeZone("UTC")
        return dateFormat.format(Date())
    }

    /**
     * Clean orphan temp files matching the article temp prefix in the article-html directory.
     * Called at worker start to remove stale temp files from interrupted downloads.
     */
    private fun cleanOrphanTempFiles() {
        try {
            val htmlCacheDir = File(context.cacheDir, "article-html")
            if (!htmlCacheDir.exists() || !htmlCacheDir.isDirectory) {
                return
            }

            val tempFiles = htmlCacheDir.listFiles { file ->
                file.name.startsWith("article-") && file.name.endsWith(".html.tmp")
            }

            if (tempFiles != null) {
                var cleaned = 0
                for (tempFile in tempFiles) {
                    try {
                        if (tempFile.delete()) {
                            cleaned++
                        }
                    } catch (e: Exception) {
                        // Ignore individual file deletion failures
                    }
                }
                if (cleaned > 0) {
                    android.util.Log.i("ArticleDownloadWorker", "Cleaned $cleaned orphan temp files")
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("ArticleDownloadWorker", "Failed to clean orphan temp files", e)
        }
    }
}
