package com.ggsalas.noticiosoandroid.feedrefresh

import java.util.regex.Pattern

/**
 * Extracts article metadata from HTML content using regex patterns.
 * Matches the semantics of JS ArticleCacheService extraction.
 */
object ArticleMetadataExtractor {
    data class ArticleMetadata(
        val heroImage: String?,
        val byline: String,
        val title: String,
        val excerpt: String
    )

    // Patterns for hero image extraction
    private val ogImagePattern1 = Pattern.compile(
        """<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val ogImagePattern2 = Pattern.compile(
        """<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val twitterImagePattern1 = Pattern.compile(
        """<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val twitterImagePattern2 = Pattern.compile(
        """<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val imageSrcPattern = Pattern.compile(
        """<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )

    // Patterns for author extraction
    private val authorPattern1 = Pattern.compile(
        """<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val authorPattern2 = Pattern.compile(
        """<meta[^>]+content=["']([^"']+)["'][^>]+name=["']author["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val articleAuthorPattern = Pattern.compile(
        """<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val dcCreatorPattern = Pattern.compile(
        """<meta[^>]+name=["']dc\.creator["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )

    // Patterns for title extraction
    private val ogTitlePattern = Pattern.compile(
        """<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val titlePattern = Pattern.compile(
        """<title[^>]*>([^<]+)</title>""",
        Pattern.CASE_INSENSITIVE
    )

    // Patterns for excerpt extraction
    private val ogDescriptionPattern = Pattern.compile(
        """<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )
    private val descriptionPattern = Pattern.compile(
        """<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']""",
        Pattern.CASE_INSENSITIVE
    )

    fun extract(html: String): ArticleMetadata {
        return ArticleMetadata(
            heroImage = extractHeroImage(html),
            byline = extractAuthor(html),
            title = extractTitle(html),
            excerpt = extractExcerpt(html)
        )
    }

    private fun extractHeroImage(html: String): String? {
        val patterns = listOf(
            ogImagePattern1,
            ogImagePattern2,
            twitterImagePattern1,
            twitterImagePattern2,
            imageSrcPattern
        )

        for (pattern in patterns) {
            val matcher = pattern.matcher(html)
            if (matcher.find()) {
                return matcher.group(1)
            }
        }

        return null
    }

    private fun extractAuthor(html: String): String {
        val patterns = listOf(
            authorPattern1,
            authorPattern2,
            articleAuthorPattern,
            dcCreatorPattern
        )

        for (pattern in patterns) {
            val matcher = pattern.matcher(html)
            if (matcher.find()) {
                return matcher.group(1)
            }
        }

        return ""
    }

    private fun extractTitle(html: String): String {
        ogTitlePattern.matcher(html).let { matcher ->
            if (matcher.find()) {
                return matcher.group(1)
            }
        }

        titlePattern.matcher(html).let { matcher ->
            if (matcher.find()) {
                return matcher.group(1).trim()
            }
        }

        return ""
    }

    private fun extractExcerpt(html: String): String {
        ogDescriptionPattern.matcher(html).let { matcher ->
            if (matcher.find()) {
                return matcher.group(1)
            }
        }

        descriptionPattern.matcher(html).let { matcher ->
            if (matcher.find()) {
                return matcher.group(1)
            }
        }

        return ""
    }
}
