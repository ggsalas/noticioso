package com.ggsalas.noticiosoandroid.feedrefresh

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Downloads article HTML files and extracts metadata.
 * 
 * File path algorithm must match JS ArticleCacheService.getFilePath exactly:
 * - JS: encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"))
 * - Directory: context.cacheDir/article-html
 * - Final: {directory}/{safeName}.html
 */
class ArticleDownloader(private val context: Context) {
    
    private val htmlCacheDir: File by lazy {
        File(context.cacheDir, "article-html").also { it.mkdirs() }
    }
    
    /**
     * Download article HTML and persist metadata.
     * 
     * Returns the final file path on success, or throws an exception on failure.
     * 
     * Process:
     * 1. Download to unique temp file in cacheDir/article-html
     * 2. Atomic rename to final path (same filesystem)
     * 3. Parse HTML for metadata
     * 4. Insert/update article_metadata in SQLite
     */
    fun downloadAndPersist(
        url: String,
        db: SQLiteDatabase
    ): String {
        val finalPath = getFilePath(url)
        val finalFile = File(finalPath)
        
        // If final file already exists, we still need to ensure metadata exists
        if (finalFile.exists()) {
            ensureMetadataExists(url, finalFile, db)
            return finalPath
        }
        
        // Download to temp file
        val tempFile = createTempFile()
        try {
            downloadTo(url, tempFile)
            
            // Before rename, check if final file was created by another process
            // (race condition between exists check and rename)
            if (finalFile.exists()) {
                // Another process already created the final file, discard temp
                tempFile.delete()
                // Reconcile metadata from final file
                ensureMetadataExists(url, finalFile, db)
                return finalPath
            }
            
            // Atomic rename to final path
            if (!tempFile.renameTo(finalFile)) {
                throw RuntimeException("Failed to rename temp file to final path")
            }
            
            // Parse metadata and persist
            val html = finalFile.readText()
            val metadata = ArticleMetadataExtractor.extract(html)
            persistMetadata(url, metadata, db)
            
            return finalPath
        } catch (e: Exception) {
            // Clean up temp file on failure
            if (tempFile.exists()) {
                tempFile.delete()
            }
            throw e
        }
    }
    
    /**
     * Ensure metadata exists for an article that already has a file.
     * If metadata is missing, parse the file and create it.
     */
    fun ensureMetadataExists(
        url: String,
        file: File,
        db: SQLiteDatabase
    ) {
        if (!metadataExists(url, db)) {
            val html = file.readText()
            val metadata = ArticleMetadataExtractor.extract(html)
            persistMetadata(url, metadata, db)
        }
    }
    
    private fun metadataExists(url: String, db: SQLiteDatabase): Boolean {
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM article_metadata WHERE url = ?",
            arrayOf(url)
        )
        return cursor.use {
            it.moveToFirst() && it.getInt(0) > 0
        }
    }
    
    private fun persistMetadata(
        url: String,
        metadata: ArticleMetadataExtractor.ArticleMetadata,
        db: SQLiteDatabase
    ) {
        val now = currentTimestamp()
        
        db.execSQL(
            """INSERT OR REPLACE INTO article_metadata 
               (url, hero_image, byline, title, excerpt, fetched_at, last_accessed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            arrayOf(
                url,
                metadata.heroImage,
                metadata.byline,
                metadata.title,
                metadata.excerpt,
                now,
                now
            )
        )
    }
    
    private fun downloadTo(urlString: String, targetFile: File) {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection
        
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
    
    private fun createTempFile(): File {
        return File.createTempFile("article-", ".html.tmp", htmlCacheDir)
    }
    
    /**
     * Generate file path matching JS algorithm exactly.
     * 
     * JS: encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"))
     * 
     * Kotlin equivalent:
     * 1. Replace non-alphanumeric with underscore
     * 2. URL encode the result
     */
    fun getFilePath(url: String): String {
        // Step 1: Replace non-alphanumeric with underscore (matches JS regex /[^a-zA-Z0-9]/g)
        val replaced = url.replace(Regex("[^a-zA-Z0-9]"), "_")
        
        // Step 2: URL encode (matches JS encodeURIComponent)
        // Note: Kotlin URLEncoder.encode uses application/x-www-form-urlencoded,
        // which encodes spaces as '+' instead of '%20'. We need to match JS behavior.
        val encoded = URLEncoder.encode(replaced, "UTF-8")
            .replace("+", "%20") // Match JS encodeURIComponent behavior
            .replace("%7E", "~") // JS doesn't encode ~
        
        return File(htmlCacheDir, "$encoded.html").absolutePath
    }
    
    /**
     * Check if article HTML file exists.
     */
    fun fileExists(url: String): Boolean {
        return File(getFilePath(url)).exists()
    }
    
    private fun currentTimestamp(): String {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        dateFormat.timeZone = TimeZone.getTimeZone("UTC")
        return dateFormat.format(Date())
    }
}
