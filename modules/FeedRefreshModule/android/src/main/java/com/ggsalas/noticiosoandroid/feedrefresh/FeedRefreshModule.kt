package com.ggsalas.noticiosoandroid.feedrefresh

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Xml
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.xmlpull.v1.XmlPullParser

data class Feed(
    val id: String,
    val name: String,
    val url: String,
    val oldestArticle: Int,
    val lang: String
)

data class FeedContentItem(
    val title: String,
    val link: String,
    val pubDate: String,
    val author: String,
    val description: String,
    val contentEncoded: String?
)

data class Channel(
    val title: String,
    val description: String,
    val language: String,
    val link: String,
    val lastBuildDate: String,
    val item: List<FeedContentItem>
)

data class FeedData(
    val date: String,
    val feedType: String,
    val channel: Channel
)

class FeedRefreshModule : Module() {
    // Single native worker slot - gates feed refresh, article downloads, and reconciliation
    // Only one of these operations can be active at a time
    private val nativeWorkerSlot = AtomicBoolean(false)
    private val dbLock = AtomicReference<SQLiteDatabase?>()

    // Module-level article worker queue to serialize refreshIds and reconciliation
    private sealed class ArticleWorkerTask {
        data class Download(val refreshId: String) : ArticleWorkerTask()
        object Reconcile : ArticleWorkerTask()
    }
    private val articleWorkerQueue = java.util.concurrent.ConcurrentLinkedQueue<ArticleWorkerTask>()
    // Prevents multiple drain loops from running concurrently on the executor
    private val articleProcessingActive = AtomicBoolean(false)
    private val articleWorkerExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    override fun definition() = ModuleDefinition {
        Name("FeedRefreshModule")

        // Events for article download progress
        Events("onArticleDownloadFeedStarted", "onArticleDownloadFeedComplete")

        AsyncFunction("refreshFeeds") { feeds: List<Map<String, Any>> ->
            if (!nativeWorkerSlot.compareAndSet(false, true)) {
                return@AsyncFunction "Feed refresh already in progress"
            }

            var db: SQLiteDatabase? = null
            var slotTransferred = false
            try {
                val context = appContext.reactContext ?: run {
                    nativeWorkerSlot.set(false)
                    return@AsyncFunction "No context"
                }
                db = getDatabase(context)
                dbLock.set(db)

                val refreshId = UUID.randomUUID().toString()
                val createdAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())

                // Create refresh record
                db.execSQL(
                    "INSERT INTO refreshes (id, state, created_at) VALUES (?, 'building', ?)",
                    arrayOf(refreshId, createdAt)
                )

                var successCount = 0
                var failureCount = 0
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
                        if (feedData != null) {
                            // Save snapshot
                            val dataJson = serializeFeedData(feedData)
                            val cachedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                                timeZone = TimeZone.getTimeZone("UTC")
                            }.format(Date())

                            db.execSQL(
                                "INSERT INTO feed_snapshots (refresh_id, feed_url, data, cached_at) VALUES (?, ?, ?, ?)",
                                arrayOf(refreshId, feed.url, dataJson, cachedAt)
                            )

                            // Record success with position
                            db.execSQL(
                                "INSERT INTO refresh_feeds (refresh_id, feed_url, status, items_count, position, completed_at) VALUES (?, ?, 'success', ?, ?, ?)",
                                arrayOf(refreshId, feed.url, feedData.channel.item.size, position, cachedAt)
                            )

                            successCount++
                        } else {
                            // Record failure with position
                            val failedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                                timeZone = TimeZone.getTimeZone("UTC")
                            }.format(Date())

                            db.execSQL(
                                "INSERT INTO refresh_feeds (refresh_id, feed_url, status, error_message, position, completed_at) VALUES (?, ?, 'failed', ?, ?, ?)",
                                arrayOf(refreshId, feed.url, "Failed to fetch or parse feed", position, failedAt)
                            )

                            failedFeedUrls.add(feed.url)
                            failureCount++
                        }
                    } catch (e: Exception) {
                        // Record exception with position
                        val feedUrl = feedMap["url"] as? String ?: "unknown"
                        val failedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                            timeZone = TimeZone.getTimeZone("UTC")
                        }.format(Date())

                        db.execSQL(
                            "INSERT INTO refresh_feeds (refresh_id, feed_url, status, error_message, position, completed_at) VALUES (?, ?, 'failed', ?, ?, ?)",
                            arrayOf(refreshId, feedUrl, e.message ?: "Unknown error", position, failedAt)
                        )

                        failedFeedUrls.add(feedUrl)
                        failureCount++
                    }
                }

                // Carry forward last-good snapshots for failed feeds
                if (failedFeedUrls.isNotEmpty()) {
                    // Get the current active refresh ID
                    val activeCursor = db.rawQuery(
                        "SELECT refresh_id FROM active_refresh WHERE id = 1",
                        null
                    )
                    if (activeCursor.moveToFirst()) {
                        val activeRefreshId = activeCursor.getString(0)
                        activeCursor.close()

                        // For each failed feed, copy snapshot from active refresh (if not already present)
                        for (feedUrl in failedFeedUrls) {
                            // Check if snapshot already exists for this refresh+feed
                            val existsCursor = db.rawQuery(
                                "SELECT COUNT(*) FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
                                arrayOf(refreshId, feedUrl)
                            )
                            val alreadyExists = existsCursor.use {
                                it.moveToFirst() && it.getInt(0) > 0
                            }

                            if (!alreadyExists) {
                                val snapshotCursor = db.rawQuery(
                                    "SELECT data, cached_at FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
                                    arrayOf(activeRefreshId, feedUrl)
                                )
                                if (snapshotCursor.moveToFirst()) {
                                    val data = snapshotCursor.getString(0)
                                    val cachedAt = snapshotCursor.getString(1)
                                    snapshotCursor.close()

                                    // Copy snapshot to new refresh
                                    db.execSQL(
                                        "INSERT INTO feed_snapshots (refresh_id, feed_url, data, cached_at) VALUES (?, ?, ?, ?)",
                                        arrayOf(refreshId, feedUrl, data, cachedAt)
                                    )
                                } else {
                                    snapshotCursor.close()
                                }
                            }
                        }
                    } else {
                        activeCursor.close()
                    }
                }

                // Mark refresh as ready
                val completedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())

                db.execSQL(
                    "UPDATE refreshes SET state = 'ready', completed_at = ? WHERE id = ?",
                    arrayOf(completedAt, refreshId)
                )

                // Set as pending refresh
                db.execSQL(
                    "INSERT OR REPLACE INTO pending_refresh (id, refresh_id, ready_at) VALUES (1, ?, ?)",
                    arrayOf(refreshId, completedAt)
                )

                // Update last fetch completion
                db.execSQL(
                    "INSERT OR REPLACE INTO last_fetch_completion (id, completed_at) VALUES (1, ?)",
                    arrayOf(completedAt)
                )

                // Transfer native worker slot to article processing
                // The slot stays held by the article queue processor
                enqueueAndProcess(ArticleWorkerTask.Download(refreshId), context)
                slotTransferred = true

                "$successCount feeds downloaded successfully, $failureCount failed"
            } catch (e: Exception) {
                if (!slotTransferred) {
                    nativeWorkerSlot.set(false)
                }
                "Error: ${e.message}"
            } finally {
                dbLock.set(null)
                db?.close()
            }
        }

        // Function to trigger reconciliation of incomplete article downloads
        AsyncFunction("reconcileArticleDownloads") { ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"

            try {
                // Enqueue reconciliation task
                articleWorkerQueue.offer(ArticleWorkerTask.Reconcile)

                if (nativeWorkerSlot.compareAndSet(false, true)) {
                    // No work was active - acquire slot and start processing
                    ensureArticleProcessingRunning(context)
                    "Reconciliation started"
                } else {
                    // Work is already active - our task will be picked up by existing processing
                    "Reconciliation enqueued"
                }
            } catch (e: Exception) {
                "Error: ${e.message}"
            }
        }

        // Function to clear all article download jobs (used by StorageService.clearCaches)
        AsyncFunction("clearArticleDownloadJobs") { ->
            val context = appContext.reactContext ?: return@AsyncFunction "No context"
            var db: SQLiteDatabase? = null
            try {
                db = getDatabase(context)
                db.execSQL("DELETE FROM article_download_jobs")
                android.util.Log.i("FeedRefreshModule", "Cleared all article download jobs")
            } catch (e: Exception) {
                android.util.Log.e("FeedRefreshModule", "Failed to clear article download jobs", e)
                throw e
            } finally {
                db?.close()
            }
        }
    }

    /**
     * Enqueue a task and ensure processing is running.
     * Caller must have already acquired nativeWorkerSlot.
     */
    private fun enqueueAndProcess(task: ArticleWorkerTask, context: Context) {
        articleWorkerQueue.offer(task)
        ensureArticleProcessingRunning(context)
    }

    /**
     * Start article processing on the executor if not already running.
     * Caller must have already acquired nativeWorkerSlot.
     * The drain loop holds the slot until the queue is fully drained.
     */
    private fun ensureArticleProcessingRunning(context: Context) {
        if (!articleProcessingActive.compareAndSet(false, true)) {
            // Already processing, queued items will be picked up
            return
        }

        articleWorkerExecutor.submit {
            try {
                while (true) {
                    val task = articleWorkerQueue.poll()
                    if (task == null) {
                        // Queue empty - release slot and check for race
                        nativeWorkerSlot.set(false)
                        // Try to re-acquire to handle race with enqueue
                        if (!nativeWorkerSlot.compareAndSet(false, true)) {
                            // Someone else acquired, they'll handle it
                            break
                        }
                        // We re-acquired - check if anything was enqueued
                        if (articleWorkerQueue.isNotEmpty()) {
                            continue // process them
                        }
                        // Nothing to do - release for real
                        nativeWorkerSlot.set(false)
                        break
                    }

                    when (task) {
                        is ArticleWorkerTask.Download -> {
                            android.util.Log.i("FeedRefreshModule", "Processing article download for refresh ${task.refreshId}")
                            try {
                                val worker = ArticleDownloadWorker(context, this@FeedRefreshModule)
                                val result = worker.downloadArticlesForRefresh(task.refreshId)
                                android.util.Log.i("FeedRefreshModule", "Article download complete for refresh ${task.refreshId}: $result")
                            } catch (e: Exception) {
                                android.util.Log.e("FeedRefreshModule", "Article download failed for refresh ${task.refreshId}", e)
                            }
                        }
                        is ArticleWorkerTask.Reconcile -> {
                            android.util.Log.i("FeedRefreshModule", "Processing reconciliation")
                            try {
                                val worker = ArticleDownloadWorker(context, this@FeedRefreshModule)
                                val result = worker.reconcileIncompleteJobs()
                                android.util.Log.i("FeedRefreshModule", "Reconciliation complete: $result")
                            } catch (e: Exception) {
                                android.util.Log.e("FeedRefreshModule", "Reconciliation failed", e)
                            }
                        }
                    }
                }
            } finally {
                articleProcessingActive.set(false)
            }
        }
    }

    private fun getDatabase(context: Context): SQLiteDatabase {
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

    private fun fetchAndParseFeed(feed: Feed): FeedData? {
        return try {
            val url = URL(feed.url)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            if (connection.responseCode !in 200..299) {
                connection.disconnect()
                return null
            }

            val inputStream: InputStream = connection.inputStream
            val feedData = parseXml(inputStream, feed)
            inputStream.close()
            connection.disconnect()

            // Filter by oldestArticle
            val filteredItems = filterByDate(feedData.channel.item, feed.oldestArticle)
            feedData.copy(
                channel = feedData.channel.copy(item = filteredItems)
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun parseXml(inputStream: InputStream, feed: Feed): FeedData {
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
        parser.setInput(inputStream, null)
        val handler = FeedPullParserHandler(parser)
        return handler.parse()
    }

    private fun filterByDate(items: List<FeedContentItem>, oldestArticle: Int): List<FeedContentItem> {
        val threshold = Calendar.getInstance().apply {
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

    private fun serializeFeedData(feedData: FeedData): String {
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
}

class FeedPullParserHandler(private val parser: XmlPullParser) {
    private var feedType: String = "unknown"

    private var channelTitle = ""
    private var channelDescription = ""
    private var channelLanguage = ""
    private var channelLink = ""
    private var channelLastBuildDate = ""

    private var items = mutableListOf<FeedContentItem>()

    fun parse(): FeedData {
        var eventType = parser.eventType

        while (eventType != XmlPullParser.END_DOCUMENT) {
            if (eventType == XmlPullParser.START_TAG) {
                val ns = parser.namespace ?: ""
                val localName = parser.name ?: ""
                val qName = if (ns.isNotEmpty()) "$ns:$localName" else localName
                val lower = localName.lowercase(Locale.US)

                when {
                    // RDF root: rdf:RDF
                    lower == "rdf" && ns.lowercase(Locale.US).contains("rdf") -> feedType = "rdf"
                    // RSS root
                    lower == "rss" -> feedType = "rss"
                    // Atom root
                    lower == "feed" -> {
                        feedType = "atom"
                        parseAtomRoot()
                    }
                    // RSS channel
                    lower == "channel" -> parseChannel()
                    // RSS item (top-level, also caught inside channel)
                    lower == "item" -> parseItem()
                    // Atom entry
                    lower == "entry" -> parseEntry()
                }
                // Suppress unused variable warning
                qName.hashCode()
            }
            eventType = parser.next()
        }

        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())

        return FeedData(
            date = date,
            feedType = feedType,
            channel = Channel(
                title = channelTitle,
                description = channelDescription,
                language = channelLanguage,
                link = channelLink,
                lastBuildDate = channelLastBuildDate,
                item = items
            )
        )
    }

    // Extract Atom feed-level metadata (called when we see <feed>)
    private fun parseAtomRoot() {
        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()
            if (eventType == XmlPullParser.START_TAG) {
                depth++
                val localName = (parser.name ?: "").lowercase(Locale.US)
                when (localName) {
                    "title" -> {
                        if (channelTitle.isEmpty()) channelTitle = collectText()
                        depth-- // collectText consumed through </title>
                    }
                    "subtitle" -> {
                        if (channelDescription.isEmpty()) channelDescription = collectText()
                        depth-- // collectText consumed through </subtitle>
                    }
                    "link" -> {
                        if (channelLink.isEmpty()) {
                            val rel = parser.getAttributeValue(null, "rel") ?: "alternate"
                            if (rel == "alternate" || rel == "") {
                                val href = parser.getAttributeValue(null, "href") ?: ""
                                if (href.isNotEmpty()) {
                                    channelLink = href
                                } else {
                                    channelLink = collectText()
                                    depth-- // collectText consumed through </link>
                                }
                            }
                        }
                    }
                    "updated" -> {
                        if (channelLastBuildDate.isEmpty()) channelLastBuildDate = collectText()
                        depth-- // collectText consumed through </updated>
                    }
                    "entry" -> {
                        parseEntry()
                        depth-- // parseEntry consumed through </entry>
                    }
                    else -> { /* unknown tag, depth++ already done */ }
                }
            } else if (eventType == XmlPullParser.END_TAG) {
                depth--
            }
        }
    }

    private fun parseChannel() {
        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)

                    when (localName) {
                        "title" -> {
                            if (channelTitle.isEmpty()) channelTitle = collectText()
                            depth-- // collectText consumed through </title>
                        }
                        "description" -> {
                            if (channelDescription.isEmpty()) channelDescription = collectText()
                            depth-- // collectText consumed through </description>
                        }
                        "language" -> {
                            if (channelLanguage.isEmpty()) channelLanguage = collectText()
                            depth-- // collectText consumed through </language>
                        }
                        "link" -> {
                            if (channelLink.isEmpty()) channelLink = collectText()
                            depth-- // collectText consumed through </link>
                        }
                        "lastbuilddate" -> {
                            if (channelLastBuildDate.isEmpty()) channelLastBuildDate = collectText()
                            depth-- // collectText consumed through </lastBuildDate>
                        }
                        "item" -> {
                            parseItem()
                            depth-- // parseItem consumed through </item>
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
            }
        }
    }

    private fun parseItem() {
        var title = ""
        var link = ""
        var pubDate = ""
        var author = ""
        var description = ""
        var contentEncoded: String? = null

        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)
                    val ns = (parser.namespace ?: "").lowercase(Locale.US)

                    when {
                        localName == "title" && title.isEmpty() -> {
                            title = collectText()
                            depth-- // collectText consumed through </title>
                        }
                        localName == "link" && link.isEmpty() -> {
                            link = collectText()
                            depth-- // collectText consumed through </link>
                        }
                        localName == "pubdate" && pubDate.isEmpty() -> {
                            pubDate = collectText()
                            depth-- // collectText consumed through </pubDate>
                        }
                        localName == "author" && author.isEmpty() -> {
                            author = collectText()
                            depth-- // collectText consumed through </author>
                        }
                        localName == "creator" && ns.contains("dc") && author.isEmpty() -> {
                            author = collectText()
                            depth-- // collectText consumed through </dc:creator>
                        }
                        localName == "description" && description.isEmpty() -> {
                            description = collectText()
                            depth-- // collectText consumed through </description>
                        }
                        localName == "encoded" && ns.contains("content") && contentEncoded == null -> {
                            contentEncoded = collectText()
                            depth-- // collectText consumed through </content:encoded>
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
            }
        }

        items.add(FeedContentItem(
            title = title,
            link = link,
            pubDate = pubDate,
            author = author,
            description = description,
            contentEncoded = contentEncoded
        ))
    }

    private fun parseEntry() {
        var title = ""
        var link = ""
        var pubDate = ""
        var author = ""
        var description = ""
        var contentEncoded: String? = null

        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)

                    when (localName) {
                        "title" -> {
                            if (title.isEmpty()) {
                                title = collectText()
                                depth-- // collectText consumed through </title>
                            }
                        }
                        "link" -> {
                            if (link.isEmpty()) {
                                val rel = parser.getAttributeValue(null, "rel") ?: "alternate"
                                if (rel == "alternate" || rel == "") {
                                    val href = parser.getAttributeValue(null, "href") ?: ""
                                    if (href.isNotEmpty()) {
                                        link = href
                                    } else {
                                        link = collectText()
                                        depth-- // collectText consumed through </link>
                                    }
                                }
                            }
                        }
                        "published" -> {
                            if (pubDate.isEmpty()) {
                                pubDate = collectText()
                                depth-- // collectText consumed through </published>
                            }
                        }
                        "updated" -> {
                            if (pubDate.isEmpty()) {
                                pubDate = collectText()
                                depth-- // collectText consumed through </updated>
                            }
                        }
                        "author" -> {
                            if (author.isEmpty()) {
                                author = parseAuthorElement()
                                depth-- // parseAuthorElement consumed through </author>
                            }
                        }
                        "summary" -> {
                            if (description.isEmpty()) {
                                description = collectText()
                                depth-- // collectText consumed through </summary>
                            }
                        }
                        "content" -> {
                            if (contentEncoded == null) {
                                contentEncoded = collectText()
                                depth-- // collectText consumed through </content>
                            }
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
            }
        }

        items.add(FeedContentItem(
            title = title,
            link = link,
            pubDate = pubDate,
            author = author,
            description = description,
            contentEncoded = contentEncoded
        ))
    }

    private fun parseAuthorElement(): String {
        var author = ""
        var depth = 1

        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)
                    if (localName == "name" && author.isEmpty()) {
                        author = collectText()
                    }
                }
                XmlPullParser.END_TAG -> depth--
            }
        }

        return author
    }

    /**
     * Collects all text content within the current element (TEXT + CDATA + nested text),
     * advancing the parser past the matching END_TAG. This matches fast-xml-parser's
     * behavior of concatenating all text children.
     */
    private fun collectText(): String {
        val sb = StringBuilder()
        var depth = 1
        while (depth > 0) {
            when (val ev = parser.next()) {
                XmlPullParser.TEXT, XmlPullParser.CDSECT -> {
                    sb.append(parser.text ?: "")
                }
                XmlPullParser.START_TAG -> depth++
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
                else -> { /* ignore */ }
            }
        }
        return sb.toString()
    }
}
