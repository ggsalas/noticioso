package com.ggsalas.noticiosoandroid.feedrefresh.articles

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * File names are a contract with JS:
 *   encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_")) + ".html"
 */
class ArticleFilesTest {
    @Test
    fun replacesEveryNonAlphanumericCharacterWithUnderscore() {
        assertEquals(
            "https___example_com_news_2026_11_my_article_.html",
            ArticleFiles.fileNameFor("https://example.com/news/2026/11/my-article/")
        )
    }

    @Test
    fun queryStringsAndFragments() {
        assertEquals(
            "https___hnrss_org_item_id_123_ref_a_b_top.html",
            ArticleFiles.fileNameFor("https://hnrss.org/item?id=123&ref=a+b#top")
        )
    }

    @Test
    fun nonAsciiCharactersBecomeUnderscores() {
        // "ñ" and "é" are outside [a-zA-Z0-9], so JS replaces them before encoding
        assertEquals(
            "https___elpais_com_espa_a_caf_.html",
            ArticleFiles.fileNameFor("https://elpais.com/españa/café")
        )
    }
}
