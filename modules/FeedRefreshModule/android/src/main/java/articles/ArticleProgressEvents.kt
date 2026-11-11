package com.ggsalas.noticiosoandroid.feedrefresh.articles

/**
 * Progress notifications for the UI. Best-effort: SQLite + files are the source
 * of truth, so implementations must never throw.
 * Keeps the download worker independent from the Expo module class.
 */
interface ArticleProgressEvents {
    /** Emitted once before the articles of a generation start downloading. */
    fun feedStarted(refreshId: String, feedCount: Int, articleCount: Int)

    /** Emitted per feed with its outcome (feedIndex is 1-based). */
    fun feedCompleted(
        refreshId: String,
        feedUrl: String,
        feedIndex: Int,
        feedCount: Int,
        articleCount: Int,
        articleSuccessCount: Int,
        articleFailedCount: Int
    )
}
