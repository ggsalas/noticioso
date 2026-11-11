package com.ggsalas.noticiosoandroid.feedrefresh.articles

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ArticleMetadataExtractorTest {
    @Test
    fun extractsOpenGraphMetadata() {
        val html = """<html><head>
            <meta property="og:image" content="https://example.com/hero.jpg">
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG description">
            <meta name="author" content="Jane Doe">
            <title>Plain title</title>
        </head><body></body></html>"""

        val metadata = ArticleMetadataExtractor.extract(html)

        assertEquals("https://example.com/hero.jpg", metadata.heroImage)
        assertEquals("OG Title", metadata.title)
        assertEquals("OG description", metadata.excerpt)
        assertEquals("Jane Doe", metadata.byline)
    }

    @Test
    fun fallsBackToTitleTagAndMetaDescription() {
        val html = """<html><head>
            <title>  Plain title  </title>
            <meta name="description" content="Meta description">
        </head></html>"""

        val metadata = ArticleMetadataExtractor.extract(html)

        assertEquals("Plain title", metadata.title)
        assertEquals("Meta description", metadata.excerpt)
    }

    @Test
    fun missingMetadataIsEmptyNotAnError() {
        val metadata = ArticleMetadataExtractor.extract("<html><body>nothing</body></html>")

        assertNull(metadata.heroImage)
        assertEquals("", metadata.title)
        assertEquals("", metadata.excerpt)
        assertEquals("", metadata.byline)
    }
}
