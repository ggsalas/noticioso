package com.ggsalas.noticiosoandroid.feedrefresh.db

import android.database.sqlite.SQLiteDatabase

/**
 * SQL for `article_download_jobs` (per generation, PK = refresh_id + url) and
 * `article_metadata` (global per URL, shared by all generations).
 */
class ArticleJobStore(private val db: SQLiteDatabase) {

    // ---- jobs ----

    fun createIfMissing(refreshId: String, articleUrl: String, feedUrl: String, createdAt: String) {
        if (status(refreshId, articleUrl) != null) return

        db.execSQL(
            """INSERT INTO article_download_jobs
               (refresh_id, url, feed_url, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            arrayOf(refreshId, articleUrl, feedUrl, createdAt)
        )
    }

    fun status(refreshId: String, articleUrl: String): String? =
        db.rawQuery(
            "SELECT status FROM article_download_jobs WHERE refresh_id = ? AND url = ?",
            arrayOf(refreshId, articleUrl)
        ).use { if (it.moveToFirst()) it.getString(0) else null }

    fun markDownloading(refreshId: String, articleUrl: String) {
        db.execSQL(
            "UPDATE article_download_jobs SET status = 'downloading' WHERE refresh_id = ? AND url = ?",
            arrayOf(refreshId, articleUrl)
        )
    }

    fun markCompleted(refreshId: String, articleUrl: String, filePath: String) {
        db.execSQL(
            """UPDATE article_download_jobs
               SET status = 'completed', file_path = ?, completed_at = ?
               WHERE refresh_id = ? AND url = ?""",
            arrayOf(filePath, Timestamps.nowIso(), refreshId, articleUrl)
        )
    }

    fun markFailed(refreshId: String, articleUrl: String, errorMessage: String) {
        db.execSQL(
            """UPDATE article_download_jobs
               SET status = 'failed', error_message = ?, completed_at = ?
               WHERE refresh_id = ? AND url = ?""",
            arrayOf(errorMessage, Timestamps.nowIso(), refreshId, articleUrl)
        )
    }

    /** A generation was superseded: its unfinished jobs will never run. */
    fun failIncompleteAsSuperseded(refreshId: String) {
        db.execSQL(
            "UPDATE article_download_jobs SET status = 'failed', error_message = 'Refresh superseded' WHERE refresh_id = ? AND status IN ('pending', 'downloading')",
            arrayOf(refreshId)
        )
    }

    /** Generations with unfinished jobs, newest first. */
    fun refreshIdsWithIncompleteJobs(): List<String> =
        db.rawQuery(
            """SELECT DISTINCT refresh_id FROM article_download_jobs
               WHERE status IN ('pending', 'downloading')
               ORDER BY created_at DESC""",
            null
        ).use { cursor ->
            val ids = mutableListOf<String>()
            while (cursor.moveToNext()) ids.add(cursor.getString(0))
            ids
        }

    /**
     * A generation still needs work if it has non-terminal jobs, or no jobs at all
     * (process died after the feed pass but before jobs were inserted).
     */
    fun hasPendingWork(refreshId: String): Boolean =
        db.rawQuery(
            """SELECT COUNT(*), SUM(CASE WHEN status IN ('pending', 'downloading') THEN 1 ELSE 0 END)
               FROM article_download_jobs WHERE refresh_id = ?""",
            arrayOf(refreshId)
        ).use { cursor ->
            if (!cursor.moveToFirst()) return true
            val total = cursor.getInt(0)
            val incomplete = cursor.getInt(1)
            total == 0 || incomplete > 0
        }

    fun deleteAllJobs() {
        db.execSQL("DELETE FROM article_download_jobs")
    }

    // ---- article metadata ----

    fun metadataExists(url: String): Boolean =
        db.rawQuery(
            "SELECT COUNT(*) FROM article_metadata WHERE url = ?",
            arrayOf(url)
        ).use { it.moveToFirst() && it.getInt(0) > 0 }

    fun saveMetadata(url: String, heroImage: String?, byline: String?, title: String?, excerpt: String?) {
        val now = Timestamps.nowIso()
        db.execSQL(
            """INSERT OR REPLACE INTO article_metadata
               (url, hero_image, byline, title, excerpt, fetched_at, last_accessed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            arrayOf(url, heroImage, byline, title, excerpt, now, now)
        )
    }

    fun metadataUrls(): List<String> =
        db.rawQuery("SELECT url FROM article_metadata", null).use { cursor ->
            val urls = mutableListOf<String>()
            while (cursor.moveToNext()) urls.add(cursor.getString(0))
            urls
        }

    fun deleteMetadata(url: String) {
        db.execSQL("DELETE FROM article_metadata WHERE url = ?", arrayOf(url))
    }
}
