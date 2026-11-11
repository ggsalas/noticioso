package com.ggsalas.noticiosoandroid.feedrefresh.articles

import android.content.Context
import java.io.File
import java.net.URLEncoder

/**
 * Where article HTML lives on disk: `<cacheDir>/article-html/<name>.html`.
 *
 * CONTRACT with JS (`ArticleCacheService.getFilePath`): both runtimes read and
 * write the same files, so the file name must be computed identically:
 *   JS: encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_")) + ".html"
 * Changing it on one side only silently breaks the shared cache.
 */
object ArticleFiles {
    const val DIRECTORY = "article-html"
    // Bulk downloads (serial worker) and on-demand downloads use different temp
    // prefixes: the worker cleans up ITS stale temp files at start and must not
    // delete an on-demand download in progress.
    private const val TEMP_PREFIX = "article-"
    private const val ON_DEMAND_TEMP_PREFIX = "ondemand-"
    private const val TEMP_SUFFIX = ".html.tmp"

    /** Pure function (no Android dependency) so it can be unit-tested against JS vectors. */
    fun fileNameFor(url: String): String {
        // Step 1: replace non-alphanumeric with underscore (JS regex /[^a-zA-Z0-9]/g)
        val replaced = url.replace(Regex("[^a-zA-Z0-9]"), "_")

        // Step 2: match JS encodeURIComponent. URLEncoder uses form encoding
        // (space -> '+', '~' -> %7E), so normalize those two differences.
        val encoded = URLEncoder.encode(replaced, "UTF-8")
            .replace("+", "%20")
            .replace("%7E", "~")

        return "$encoded.html"
    }

    fun directory(context: Context): File =
        File(context.cacheDir, DIRECTORY).also { it.mkdirs() }

    fun fileFor(context: Context, url: String): File =
        File(directory(context), fileNameFor(url))

    fun createTempFile(context: Context, onDemand: Boolean = false): File =
        File.createTempFile(if (onDemand) ON_DEMAND_TEMP_PREFIX else TEMP_PREFIX, TEMP_SUFFIX, directory(context))

    /** Remove temp files left by interrupted bulk downloads. Returns how many were deleted. */
    fun deleteTempFiles(context: Context): Int {
        val tempFiles = directory(context).listFiles { file ->
            file.name.startsWith(TEMP_PREFIX) && file.name.endsWith(TEMP_SUFFIX)
        } ?: return 0
        return tempFiles.count { runCatching { it.delete() }.getOrDefault(false) }
    }
}
