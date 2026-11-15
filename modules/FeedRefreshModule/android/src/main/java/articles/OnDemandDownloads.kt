package com.ggsalas.noticiosoandroid.feedrefresh.articles

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * Coordinates on-demand article downloads (the user opened an article that is
 * not cached yet) with garbage collection.
 *
 * On-demand downloads do NOT run on the serial worker — the reader must not wait
 * behind a bulk download — so they need their own protection:
 * - GC runs exclusively: it waits for in-flight on-demand downloads, and none
 *   starts while it deletes files.
 * - URLs downloaded on demand in this app session are reported to GC as "in use",
 *   so an article outside every feed (e.g. a shared link) is not deleted while the
 *   user is reading it. It becomes collectable in a later session.
 */
object OnDemandDownloads {
    private val lock = ReentrantReadWriteLock()
    private val sessionUrls = ConcurrentHashMap.newKeySet<String>()

    fun <T> download(url: String, block: () -> T): T = lock.read {
        sessionUrls.add(url)
        block()
    }

    /** Run GC with no on-demand download in flight; receives the URLs to keep. */
    fun <T> exclusively(block: (protectedUrls: Set<String>) -> T): T = lock.write {
        block(sessionUrls.toSet())
    }
}
