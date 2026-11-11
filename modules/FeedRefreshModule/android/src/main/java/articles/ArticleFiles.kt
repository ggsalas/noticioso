package com.ggsalas.noticiosoandroid.feedrefresh.articles

import android.content.Context
import java.io.File

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

    /**
     * Pure function (no Android dependency), tested against the shared vectors in
     * contract/article-file-names.json.
     *
     * Every UTF-16 code unit outside [a-zA-Z0-9] becomes "_" — per code unit, like
     * the JS regex, so a character outside the BMP (e.g. an emoji) yields TWO
     * underscores. The result only contains [a-zA-Z0-9_], which
     * encodeURIComponent leaves untouched, so no further encoding is needed.
     */
    fun fileNameFor(url: String): String {
        val safeName = buildString(url.length) {
            for (c in url) {
                append(if (c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9') c else '_')
            }
        }
        return "$safeName.html"
    }

    fun directory(context: Context): File =
        File(context.cacheDir, DIRECTORY).also { it.mkdirs() }

    fun fileFor(context: Context, url: String): File =
        File(directory(context), fileNameFor(url))

    fun createTempFile(context: Context, onDemand: Boolean = false): File =
        File.createTempFile(if (onDemand) ON_DEMAND_TEMP_PREFIX else TEMP_PREFIX, TEMP_SUFFIX, directory(context))

    /** Delete every cached article file (and temp file). Returns how many were deleted. */
    fun deleteAll(context: Context): Int =
        directory(context).listFiles()?.count { it.isFile && it.delete() } ?: 0

    /** Remove temp files left by interrupted bulk downloads. Returns how many were deleted. */
    fun deleteTempFiles(context: Context): Int {
        val tempFiles = directory(context).listFiles { file ->
            file.name.startsWith(TEMP_PREFIX) && file.name.endsWith(TEMP_SUFFIX)
        } ?: return 0
        return tempFiles.count { runCatching { it.delete() }.getOrDefault(false) }
    }
}
