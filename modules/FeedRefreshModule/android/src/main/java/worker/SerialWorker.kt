package com.ggsalas.noticiosoandroid.feedrefresh.worker

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicInteger

/**
 * The single native worker: ONE thread runs every task (feed refresh, article
 * downloads, reconciliation, garbage collection), so they never overlap.
 *
 * `onIdle` is called every time the worker drains (task count drops to 0),
 * whatever the outcome of the tasks. The UI relies on it as the guaranteed
 * terminal signal to clear transient progress.
 */
class SerialWorker(private val onIdle: () -> Unit) {
    private val executor = Executors.newSingleThreadExecutor()

    // Submitted-but-unfinished tasks. Incremented BEFORE submission so a task that
    // submits follow-up work (feed refresh -> article download) never lets the
    // count reach 0 in between.
    private val activeTaskCount = AtomicInteger(0)

    // Keys of tasks waiting in the queue (see submitOnce)
    private val queuedKeys = ConcurrentHashMap.newKeySet<String>()

    val isBusy: Boolean
        get() = activeTaskCount.get() > 0

    fun submit(task: () -> String): Future<String?> {
        activeTaskCount.incrementAndGet()
        return executor.submit<String?> {
            try {
                task()
            } catch (e: Exception) {
                android.util.Log.e("FeedRefreshModule", "Worker task failed", e)
                "Error: ${e.message}"
            } finally {
                if (activeTaskCount.decrementAndGet() == 0) {
                    onIdle()
                }
            }
        }
    }

    /**
     * Submit a task unless one with the same key is already WAITING in the queue
     * (returns null in that case). Once a task starts running its key is free
     * again, so a request made while it runs queues a new one.
     */
    fun submitOnce(key: String, task: () -> String): Future<String?>? {
        if (!queuedKeys.add(key)) return null
        return submit {
            queuedKeys.remove(key)
            task()
        }
    }
}
