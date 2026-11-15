package com.ggsalas.noticiosoandroid.feedrefresh

import com.ggsalas.noticiosoandroid.feedrefresh.articles.ArticleFiles
import com.ggsalas.noticiosoandroid.feedrefresh.db.NoticiosoDatabase
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.Channel
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.FeedContentItem
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.FeedData
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.extractArticleLinks
import com.ggsalas.noticiosoandroid.feedrefresh.feeds.serializeFeedData
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kotlin side of the JS <-> native contracts (see contract/README.md).
 * The JS side is src/__tests__/contract.test.ts, reading the same files.
 */
class ContractTest {
    // Gradle runs unit tests with the module's android/ directory as working dir
    private fun contract(name: String) = JSONObject(File("../contract/$name").readText())

    // Order-independent structural form of a JSON value (android's org.json has no deep equals)
    private fun canonical(value: Any?): Any? = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().associateWith { canonical(value.get(it)) }
        is JSONArray -> (0 until value.length()).map { canonical(value.get(it)) }
        else -> value
    }

    @Test
    fun databaseLocation() {
        val database = contract("database.json")

        assertEquals(database.getString("directory"), NoticiosoDatabase.DIRECTORY)
        assertEquals(database.getString("name"), NoticiosoDatabase.NAME)
    }

    @Test
    fun articleCacheFolderAndFileNames() {
        val fileNames = contract("article-file-names.json")

        assertEquals(fileNames.getString("directory"), ArticleFiles.DIRECTORY)
        val cases = fileNames.getJSONArray("cases")
        assertTrue(cases.length() > 0)
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            assertEquals(case.getString("url"), case.getString("fileName"), ArticleFiles.fileNameFor(case.getString("url")))
        }
    }

    @Test
    fun feedSnapshotFormat() {
        val expected = contract("feed-snapshot.json")

        val written = JSONObject(
            serializeFeedData(
                FeedData(
                    date = "2026-11-10T00:00:00.000Z",
                    feedType = "rss",
                    channel = Channel(
                        title = "Contract Feed",
                        description = "A feed used to pin the snapshot format",
                        language = "en",
                        link = "https://example.com",
                        lastBuildDate = "Tue, 10 Nov 2026 10:00:00 +0000",
                        item = listOf(
                            FeedContentItem("First \"quoted\" title", "https://example.com/1", "Tue, 10 Nov 2026 09:00:00 +0000", "Jane", "Line one\nLine two", "<p>Body</p>"),
                            FeedContentItem("Second", "https://example.com/2", "", "", "", null)
                        )
                    )
                )
            )
        )

        assertEquals(canonical(expected), canonical(written))
        // And native reads back from it the article links it will download
        assertEquals(
            listOf("https://example.com/1", "https://example.com/2"),
            extractArticleLinks(expected.toString())
        )
    }
}
