package com.ggsalas.noticiosoandroid.feedrefresh.articles

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.db.ArticleJobStore
import com.ggsalas.noticiosoandroid.feedrefresh.db.RefreshStore
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.extractArticleLinks

/**
 * Reference-aware garbage collection.
 *
 * Keeps only what the active and pending generations need:
 * 1. (one SQLite transaction) delete every other generation and its child rows,
 *    then delete article_metadata rows whose URL no kept snapshot references.
 * 2. (after commit) delete HTML files whose URL no kept snapshot references,
 *    plus leftover temp files from interrupted downloads.
 *
 * MUST run on the module's serial worker: no feed pass or download can be in
 * flight, so `building` generations and temp files are safe to remove.
 * Idempotent: if the process dies mid-run, the next run finishes the job
 * (files are matched against the referenced set, not against deleted rows).
 */
class ArticleGarbageCollector(private val context: Context) {

    fun collect(db: SQLiteDatabase): String {
        val refreshes = RefreshStore(db)
        val articles = ArticleJobStore(db)

        val activeId = refreshes.activeRefreshId() ?: return "Skipped: no active generation"
        val keep = listOfNotNull(activeId, refreshes.pendingRefreshId()).distinct()

        // URLs the kept generations reference. If any snapshot can't be parsed we
        // don't know what is in use, so no article is deleted.
        val referencedUrls = mutableSetOf<String>()
        var referencesKnown = true
        for (refreshId in keep) {
            for (json in refreshes.snapshotJsons(refreshId)) {
                val links = extractArticleLinks(json)
                if (links == null) referencesKnown = false else referencedUrls.addAll(links)
            }
        }

        var generationsDeleted = 0
        var metadataDeleted = 0

        db.beginTransaction()
        try {
            val doomed = refreshes.refreshIdsExcept(keep)
            doomed.forEach { refreshes.deleteGeneration(it) }
            generationsDeleted = doomed.size

            refreshes.deleteOrphanChildRows()

            if (referencesKnown) {
                val orphanUrls = articles.metadataUrls().filter { it !in referencedUrls }
                orphanUrls.forEach { articles.deleteMetadata(it) }
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
        val referencedFileNames = referencedUrls.map { ArticleFiles.fileNameFor(it) }.toSet()
        var filesDeleted = 0
        ArticleFiles.directory(context).listFiles()?.forEach { file ->
            if (file.isFile && file.name !in referencedFileNames && file.delete()) filesDeleted++
        }

        return "Generations deleted: $generationsDeleted, metadata deleted: $metadataDeleted, files deleted: $filesDeleted"
    }
}
