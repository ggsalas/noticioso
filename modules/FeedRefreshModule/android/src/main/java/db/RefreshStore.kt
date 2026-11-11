package com.ggsalas.noticiosoandroid.feedrefresh.db

import android.database.sqlite.SQLiteDatabase

/**
 * SQL for refresh generations: `refreshes`, `refresh_feeds`, `feed_snapshots`,
 * the `active_refresh` / `pending_refresh` pointers and `last_fetch_completion`.
 */
class RefreshStore(private val db: SQLiteDatabase) {

    // ---- pointers ----

    fun activeRefreshId(): String? = singleString("SELECT refresh_id FROM active_refresh WHERE id = 1")

    fun pendingRefreshId(): String? = singleString("SELECT refresh_id FROM pending_refresh WHERE id = 1")

    /**
     * A refresh is relevant only while active_refresh or pending_refresh points to it.
     * Using the pointer tables (not the state column) avoids resuming work for a
     * historical generation whose state was 'applied' before a newer toast apply
     * superseded it — the pointer moves atomically with the apply.
     */
    fun isStillRelevant(refreshId: String): Boolean =
        db.rawQuery(
            """SELECT 1 FROM (
                 SELECT refresh_id FROM active_refresh WHERE id = 1
                 UNION
                 SELECT refresh_id FROM pending_refresh WHERE id = 1
               ) WHERE refresh_id = ?""",
            arrayOf(refreshId)
        ).use { it.moveToFirst() }

    // ---- building a generation (feed pass) ----

    fun createBuilding(refreshId: String, createdAt: String) {
        db.execSQL(
            "INSERT INTO refreshes (id, state, created_at) VALUES (?, 'building', ?)",
            arrayOf(refreshId, createdAt)
        )
    }

    fun insertSnapshot(refreshId: String, feedUrl: String, dataJson: String, cachedAt: String) {
        db.execSQL(
            "INSERT INTO feed_snapshots (refresh_id, feed_url, data, cached_at) VALUES (?, ?, ?, ?)",
            arrayOf(refreshId, feedUrl, dataJson, cachedAt)
        )
    }

    fun recordFeedSuccess(refreshId: String, feedUrl: String, itemsCount: Int, position: Int, completedAt: String) {
        db.execSQL(
            "INSERT INTO refresh_feeds (refresh_id, feed_url, status, items_count, position, completed_at) VALUES (?, ?, 'success', ?, ?, ?)",
            arrayOf<Any>(refreshId, feedUrl, itemsCount, position, completedAt)
        )
    }

    fun recordFeedFailure(refreshId: String, feedUrl: String, errorMessage: String, position: Int, completedAt: String) {
        db.execSQL(
            "INSERT INTO refresh_feeds (refresh_id, feed_url, status, error_message, position, completed_at) VALUES (?, ?, 'failed', ?, ?, ?)",
            arrayOf<Any>(refreshId, feedUrl, errorMessage, position, completedAt)
        )
    }

    /**
     * A failed feed keeps showing its last good content: copy its snapshot from the
     * active generation into the new one (unless the new one already has it).
     */
    fun carryForwardSnapshot(fromRefreshId: String, toRefreshId: String, feedUrl: String) {
        if (hasSnapshot(toRefreshId, feedUrl)) return

        db.rawQuery(
            "SELECT data, cached_at FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
            arrayOf(fromRefreshId, feedUrl)
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                insertSnapshot(toRefreshId, feedUrl, cursor.getString(0), cursor.getString(1))
            }
        }
    }

    /**
     * Mark the generation READY and make it the pending one. A previous unapplied
     * pending generation is superseded (stale news is useless; its in-flight article
     * jobs stop via isStillRelevant). Also records the feed pass completion time.
     */
    fun markReadyAsPending(refreshId: String, completedAt: String) {
        db.execSQL(
            "UPDATE refreshes SET state = 'ready', completed_at = ? WHERE id = ?",
            arrayOf(completedAt, refreshId)
        )
        db.execSQL(
            """UPDATE refreshes SET state = 'superseded', superseded_at = ?
               WHERE id = (SELECT refresh_id FROM pending_refresh WHERE id = 1) AND id != ?""",
            arrayOf(completedAt, refreshId)
        )
        db.execSQL(
            "INSERT OR REPLACE INTO pending_refresh (id, refresh_id, ready_at) VALUES (1, ?, ?)",
            arrayOf(refreshId, completedAt)
        )
        db.execSQL(
            "INSERT OR REPLACE INTO last_fetch_completion (id, completed_at) VALUES (1, ?)",
            arrayOf(completedAt)
        )
    }

    // ---- applying the pending generation (toast tap) ----

    /**
     * Make the READY pending generation the active one, atomically:
     * the previous active becomes superseded, the pointer moves, pending is cleared.
     * Returns false (and changes nothing) if there is no READY pending generation.
     */
    fun applyPending(now: String): Boolean {
        db.beginTransaction()
        try {
            val pendingId = pendingRefreshId() ?: return false
            val isReady = db.rawQuery(
                "SELECT 1 FROM refreshes WHERE id = ? AND state = 'ready'",
                arrayOf(pendingId)
            ).use { it.moveToFirst() }
            if (!isReady) return false

            activeRefreshId()?.let { oldActiveId ->
                db.execSQL(
                    "UPDATE refreshes SET state = 'superseded', superseded_at = ? WHERE id = ?",
                    arrayOf(now, oldActiveId)
                )
            }
            db.execSQL(
                "INSERT OR REPLACE INTO active_refresh (id, refresh_id, applied_at) VALUES (1, ?, ?)",
                arrayOf(pendingId, now)
            )
            db.execSQL(
                "UPDATE refreshes SET state = 'applied', applied_at = ? WHERE id = ?",
                arrayOf(now, pendingId)
            )
            db.execSQL("DELETE FROM pending_refresh")

            db.setTransactionSuccessful()
            return true
        } finally {
            db.endTransaction()
        }
    }

    // ---- clearing everything (Settings > clear caches) ----

    /**
     * Delete every generation, pointer, job and article metadata row, atomically.
     * With the pointers gone, a running article download stops at its next
     * article (isStillRelevant becomes false). The user's feed list is not here
     * (it lives in AsyncStorage) and is never touched.
     */
    fun clearAll() {
        db.beginTransaction()
        try {
            for (table in listOf(
                "pending_refresh", "active_refresh", "last_fetch_completion",
                "article_download_jobs", "feed_snapshots", "refresh_feeds",
                "refreshes", "article_metadata"
            )) {
                db.execSQL("DELETE FROM $table")
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // ---- reading a generation ----

    /** All feeds of a generation in configured order (including failed ones). */
    fun feedUrls(refreshId: String): List<String> =
        strings(
            "SELECT feed_url FROM refresh_feeds WHERE refresh_id = ? ORDER BY position ASC",
            arrayOf(refreshId)
        )

    fun hasSnapshot(refreshId: String, feedUrl: String): Boolean =
        db.rawQuery(
            "SELECT COUNT(*) FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
            arrayOf(refreshId, feedUrl)
        ).use { it.moveToFirst() && it.getInt(0) > 0 }

    fun snapshotJson(refreshId: String, feedUrl: String): String? =
        db.rawQuery(
            "SELECT data FROM feed_snapshots WHERE refresh_id = ? AND feed_url = ?",
            arrayOf(refreshId, feedUrl)
        ).use { if (it.moveToFirst()) it.getString(0) else null }

    fun snapshotJsons(refreshId: String): List<String> =
        strings("SELECT data FROM feed_snapshots WHERE refresh_id = ?", arrayOf(refreshId))

    // ---- garbage collection ----

    fun refreshIdsExcept(keep: List<String>): List<String> {
        val placeholders = keep.joinToString(",") { "?" }
        return strings("SELECT id FROM refreshes WHERE id NOT IN ($placeholders)", keep.toTypedArray())
    }

    /**
     * Delete a generation and its child rows. Children are deleted explicitly:
     * SQLite foreign keys are off per connection by default, so ON DELETE CASCADE
     * cannot be relied on.
     */
    fun deleteGeneration(refreshId: String) {
        val args = arrayOf(refreshId)
        db.execSQL("DELETE FROM refresh_feeds WHERE refresh_id = ?", args)
        db.execSQL("DELETE FROM feed_snapshots WHERE refresh_id = ?", args)
        db.execSQL("DELETE FROM article_download_jobs WHERE refresh_id = ?", args)
        db.execSQL("DELETE FROM refreshes WHERE id = ?", args)
    }

    /** Child rows whose generation row is already gone (defensive). */
    fun deleteOrphanChildRows() {
        db.execSQL("DELETE FROM article_download_jobs WHERE refresh_id NOT IN (SELECT id FROM refreshes)")
        db.execSQL("DELETE FROM feed_snapshots WHERE refresh_id NOT IN (SELECT id FROM refreshes)")
        db.execSQL("DELETE FROM refresh_feeds WHERE refresh_id NOT IN (SELECT id FROM refreshes)")
    }

    private fun singleString(sql: String): String? =
        db.rawQuery(sql, null).use { if (it.moveToFirst()) it.getString(0) else null }

    private fun strings(sql: String, args: Array<String>?): List<String> =
        db.rawQuery(sql, args).use { cursor ->
            val result = mutableListOf<String>()
            while (cursor.moveToNext()) result.add(cursor.getString(0))
            result
        }
}
