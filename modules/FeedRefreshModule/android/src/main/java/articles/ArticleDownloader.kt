package com.ggsalas.noticiosoandroid.feedrefresh.articles

import android.content.Context
import com.ggsalas.noticiosoandroid.feedrefresh.db.ArticleJobStore
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads one article: HTML to disk (temp file + atomic rename) and its
 * metadata (hero image, byline, title, excerpt) to SQLite.
 */
class ArticleDownloader(
    private val context: Context,
    private val onDemand: Boolean = false
) {

    fun fileFor(url: String): File = ArticleFiles.fileFor(context, url)

    /**
     * Make sure the article is fully cached (file + metadata), downloading only
     * what is missing. Returns the final file path, or throws on failure.
     */
    fun downloadAndPersist(url: String, store: ArticleJobStore): String {
        val finalFile = fileFor(url)

        // File already there: only make sure metadata exists
        if (finalFile.exists()) {
            ensureMetadataExists(url, finalFile, store)
            return finalFile.absolutePath
        }

        val tempFile = ArticleFiles.createTempFile(context, onDemand)
        try {
            downloadTo(url, tempFile)

            // Someone else created the final file while we were downloading
            if (finalFile.exists()) {
                tempFile.delete()
                ensureMetadataExists(url, finalFile, store)
                return finalFile.absolutePath
            }

            // Atomic rename (same filesystem): readers never see a partial file
            if (!tempFile.renameTo(finalFile)) {
                throw RuntimeException("Failed to rename temp file to final path")
            }

            saveMetadata(url, finalFile, store)
            return finalFile.absolutePath
        } catch (e: Exception) {
            if (tempFile.exists()) {
                tempFile.delete()
            }
            throw e
        }
    }

    private fun ensureMetadataExists(url: String, file: File, store: ArticleJobStore) {
        if (!store.metadataExists(url)) {
            saveMetadata(url, file, store)
        }
    }

    private fun saveMetadata(url: String, file: File, store: ArticleJobStore) {
        val metadata = ArticleMetadataExtractor.extract(file.readText())
        store.saveMetadata(url, metadata.heroImage, metadata.byline, metadata.title, metadata.excerpt)
    }

    private fun downloadTo(urlString: String, targetFile: File) {
        val connection = URL(urlString).openConnection() as HttpURLConnection

        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.instanceFollowRedirects = true

            if (connection.responseCode !in 200..299) {
                throw RuntimeException("HTTP ${connection.responseCode} for $urlString")
            }

            connection.inputStream.use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }
        } finally {
            connection.disconnect()
        }
    }
}
