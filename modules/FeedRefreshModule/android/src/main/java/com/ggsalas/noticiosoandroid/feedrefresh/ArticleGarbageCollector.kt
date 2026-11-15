package com.ggsalas.noticiosoandroid.feedrefresh

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

/**
 * Extract article links (http/https) from a normalized feed snapshot JSON
 * (`{"rss":{"channel":{"item":[{"link":"..."}]}}}`).
 *
 * Returns null when the JSON cannot be parsed, so callers can tell
 * "no articles" apart from "unknown references" (GC must not delete on unknown).
 */
internal fun extractArticleLinks(jsonData: String): List<String>? {
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

/**
 * Stage 4 — reference-aware garbage collection.
 *
 * Keeps only what the active and pending generations need:
 * 1. (one SQLite transaction) delete every other generation and its child rows
 *    (refresh_feeds, feed_snapshots, article_download_jobs), then delete
 *    article_metadata rows whose URL no kept snapshot references.
 * 2. (after commit) delete HTML files whose URL no kept snapshot references,
 *    plus leftover `*.html.tmp` files from interrupted downloads.
 *
 * MUST run on the serial native worker: no feed pass or download can be in
 * flight, so `building` generations and temp files are safe to remove.
 * Idempotent: if the process dies mid-run, the next run finishes the job
 * (files are matched against the referenced set, not against deleted rows).
 *
 * Child rows are deleted explicitly: SQLite foreign keys are off per connection
 * by default, so ON DELETE CASCADE cannot be relied on.
 */
class ArticleGarbageCollector(context: Context) {
    private val downloader = ArticleDownloader(context)
    private val htmlCacheDir = File(context.cacheDir, "article-html")

    fun collect(db: SQLiteDatabase): String {
        val activeId = singleId(db, "SELECT refresh_id FROM active_refresh WHERE id = 1")
            ?: return "Skipped: no active generation"
        val pendingId = singleId(db, "SELECT refresh_id FROM pending_refresh WHERE id = 1")
        val keep = listOfNotNull(activeId, pendingId).distinct()

        val referencedUrls = mutableSetOf<String>()
        var referencesKnown = true
        for (refreshId in keep) {
            db.rawQuery(
                "SELECT data FROM feed_snapshots WHERE refresh_id = ?",
                arrayOf(refreshId)
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    val links = extractArticleLinks(cursor.getString(0))
                    if (links == null) referencesKnown = false else referencedUrls.addAll(links)
                }
            }
        }

        var generationsDeleted = 0
        var metadataDeleted = 0

        db.beginTransaction()
        try {
            val placeholders = keep.joinToString(",") { "?" }
            val keepArgs = keep.toTypedArray()

            val doomed = mutableListOf<String>()
            db.rawQuery(
                "SELECT id FROM refreshes WHERE id NOT IN ($placeholders)",
                keepArgs
            ).use { cursor ->
                while (cursor.moveToNext()) doomed.add(cursor.getString(0))
            }

            for (refreshId in doomed) {
                val args = arrayOf(refreshId)
                db.execSQL("DELETE FROM refresh_feeds WHERE refresh_id = ?", args)
                db.execSQL("DELETE FROM feed_snapshots WHERE refresh_id = ?", args)
                db.execSQL("DELETE FROM article_download_jobs WHERE refresh_id = ?", args)
                db.execSQL("DELETE FROM refreshes WHERE id = ?", args)
            }
            generationsDeleted = doomed.size

            // Jobs/snapshots whose generation row is already gone (defensive)
            db.execSQL("DELETE FROM article_download_jobs WHERE refresh_id NOT IN (SELECT id FROM refreshes)")
            db.execSQL("DELETE FROM feed_snapshots WHERE refresh_id NOT IN (SELECT id FROM refreshes)")
            db.execSQL("DELETE FROM refresh_feeds WHERE refresh_id NOT IN (SELECT id FROM refreshes)")

            if (referencesKnown) {
                val orphanUrls = mutableListOf<String>()
                db.rawQuery("SELECT url FROM article_metadata", null).use { cursor ->
                    while (cursor.moveToNext()) {
                        val url = cursor.getString(0)
                        if (url !in referencedUrls) orphanUrls.add(url)
                    }
                }
                for (url in orphanUrls) {
                    db.execSQL("DELETE FROM article_metadata WHERE url = ?", arrayOf(url))
                }
                metadataDeleted = orphanUrls.size
            }

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        if (!referencesKnown) {
            return "Generations deleted: $generationsDeleted; articles kept (unparseable snapshot)"
        }

        // Files after commit: a crash here only leaves files the next run removes.
        val referencedFileNames = referencedUrls.map { File(downloader.getFilePath(it)).name }.toSet()
        var filesDeleted = 0
        htmlCacheDir.listFiles()?.forEach { file ->
            if (file.isFile && file.name !in referencedFileNames && file.delete()) filesDeleted++
        }

        return "Generations deleted: $generationsDeleted, metadata deleted: $metadataDeleted, files deleted: $filesDeleted"
    }

    private fun singleId(db: SQLiteDatabase, sql: String): String? =
        db.rawQuery(sql, null).use { if (it.moveToFirst()) it.getString(0) else null }
}
