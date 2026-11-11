package com.ggsalas.noticiosoandroid.feedrefresh.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The SQLite database shared with JS (expo-sqlite).
 *
 * CONTRACT with JS (`infrastructure/database.ts`): expo-sqlite opens databases in
 * `<filesDir>/SQLite/<name>`. If either side changes the name or folder, native
 * silently opens a different, empty database. Schema and migrations are owned by JS
 * and run at app start, before any native function is called.
 */
object NoticiosoDatabase {
    const val DIRECTORY = "SQLite"
    const val NAME = "noticioso.db"

    fun open(context: Context): SQLiteDatabase {
        val dbDir = File(context.filesDir, DIRECTORY)
        if (!dbDir.exists()) {
            dbDir.mkdirs()
        }
        val dbPath = File(dbDir, NAME)

        return try {
            SQLiteDatabase.openDatabase(
                dbPath.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY
            )
        } catch (e: Exception) {
            throw RuntimeException("Failed to open database at ${dbPath.absolutePath}", e)
        }
    }
}

/** ISO-8601 UTC timestamps, same format JS writes (`new Date().toISOString()`). */
object Timestamps {
    fun nowIso(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
}
