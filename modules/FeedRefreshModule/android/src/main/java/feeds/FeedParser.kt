package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.xmlpull.v1.XmlPullParser

/**
 * Streaming parser for RSS 2.0, Atom and RDF feeds.
 * Receives an already-configured (namespace-aware) XmlPullParser so it can be
 * unit-tested on the JVM (kxml2) and use android.util.Xml in production.
 */
class FeedPullParserHandler(private val parser: XmlPullParser) {
    private var feedType: String = "unknown"

    private var channelTitle = ""
    private var channelDescription = ""
    private var channelLanguage = ""
    private var channelLink = ""
    private var channelLastBuildDate = ""

    private var items = mutableListOf<FeedContentItem>()

    fun parse(): FeedData {
        var eventType = parser.eventType

        while (eventType != XmlPullParser.END_DOCUMENT) {
            if (eventType == XmlPullParser.START_TAG) {
                val ns = parser.namespace ?: ""
                val localName = parser.name ?: ""
                val qName = if (ns.isNotEmpty()) "$ns:$localName" else localName
                val lower = localName.lowercase(Locale.US)

                when {
                    // RDF root: rdf:RDF
                    lower == "rdf" && ns.lowercase(Locale.US).contains("rdf") -> feedType = "rdf"
                    // RSS root
                    lower == "rss" -> feedType = "rss"
                    // Atom root
                    lower == "feed" -> {
                        feedType = "atom"
                        parseAtomRoot()
                    }
                    // RSS channel
                    lower == "channel" -> parseChannel()
                    // RSS item (top-level, also caught inside channel)
                    lower == "item" -> parseItem()
                    // Atom entry
                    lower == "entry" -> parseEntry()
                }
                // Suppress unused variable warning
                qName.hashCode()
            }
            eventType = parser.next()
        }

        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())

        return FeedData(
            date = date,
            feedType = feedType,
            channel = Channel(
                title = channelTitle,
                description = channelDescription,
                language = channelLanguage,
                link = channelLink,
                lastBuildDate = channelLastBuildDate,
                item = items
            )
        )
    }

    // Extract Atom feed-level metadata (called when we see <feed>)
    private fun parseAtomRoot() {
        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()
            if (eventType == XmlPullParser.START_TAG) {
                depth++
                val localName = (parser.name ?: "").lowercase(Locale.US)
                when (localName) {
                    "title" -> {
                        if (channelTitle.isEmpty()) {
                            channelTitle = collectText()
                            depth-- // collectText consumed through </title>
                        }
                    }
                    "subtitle" -> {
                        if (channelDescription.isEmpty()) {
                            channelDescription = collectText()
                            depth-- // collectText consumed through </subtitle>
                        }
                    }
                    "link" -> {
                        if (channelLink.isEmpty()) {
                            val rel = parser.getAttributeValue(null, "rel") ?: "alternate"
                            if (rel == "alternate" || rel == "") {
                                val href = parser.getAttributeValue(null, "href") ?: ""
                                if (href.isNotEmpty()) {
                                    channelLink = href
                                } else {
                                    channelLink = collectText()
                                    depth-- // collectText consumed through </link>
                                }
                            }
                        }
                    }
                    "updated" -> {
                        if (channelLastBuildDate.isEmpty()) {
                            channelLastBuildDate = collectText()
                            depth-- // collectText consumed through </updated>
                        }
                    }
                    "entry" -> {
                        parseEntry()
                        depth-- // parseEntry consumed through </entry>
                    }
                    else -> { /* unknown tag, depth++ already done */ }
                }
            } else if (eventType == XmlPullParser.END_TAG) {
                depth--
            } else if (eventType == XmlPullParser.END_DOCUMENT) {
                break
            }
        }
    }

    private fun parseChannel() {
        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)

                    when (localName) {
                        "title" -> {
                            if (channelTitle.isEmpty()) {
                                channelTitle = collectText()
                                depth-- // collectText consumed through </title>
                            }
                        }
                        "description" -> {
                            if (channelDescription.isEmpty()) {
                                channelDescription = collectText()
                                depth-- // collectText consumed through </description>
                            }
                        }
                        "language" -> {
                            if (channelLanguage.isEmpty()) {
                                channelLanguage = collectText()
                                depth-- // collectText consumed through </language>
                            }
                        }
                        "link" -> {
                            if (channelLink.isEmpty()) {
                                channelLink = collectText()
                                depth-- // collectText consumed through </link>
                            }
                        }
                        "lastbuilddate" -> {
                            if (channelLastBuildDate.isEmpty()) {
                                channelLastBuildDate = collectText()
                                depth-- // collectText consumed through </lastBuildDate>
                            }
                        }
                        "item" -> {
                            parseItem()
                            depth-- // parseItem consumed through </item>
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
            }
        }
    }

    private fun parseItem() {
        var title = ""
        var link = ""
        var pubDate = ""
        var author = ""
        var description = ""
        var contentEncoded: String? = null

        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)
                    val ns = (parser.namespace ?: "").lowercase(Locale.US)

                    when {
                        localName == "title" && title.isEmpty() -> {
                            title = collectText()
                            depth-- // collectText consumed through </title>
                        }
                        localName == "link" && link.isEmpty() -> {
                            link = collectText()
                            depth-- // collectText consumed through </link>
                        }
                        localName == "pubdate" && pubDate.isEmpty() -> {
                            pubDate = collectText()
                            depth-- // collectText consumed through </pubDate>
                        }
                        localName == "author" && author.isEmpty() -> {
                            author = collectText()
                            depth-- // collectText consumed through </author>
                        }
                        localName == "creator" && ns.contains("dc") && author.isEmpty() -> {
                            author = collectText()
                            depth-- // collectText consumed through </dc:creator>
                        }
                        localName == "description" && description.isEmpty() -> {
                            description = collectText()
                            depth-- // collectText consumed through </description>
                        }
                        localName == "encoded" && ns.contains("content") && contentEncoded == null -> {
                            contentEncoded = collectText()
                            depth-- // collectText consumed through </content:encoded>
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
            }
        }

        items.add(FeedContentItem(
            title = title,
            link = link,
            pubDate = pubDate,
            author = author,
            description = description,
            contentEncoded = contentEncoded
        ))
    }

    private fun parseEntry() {
        var title = ""
        var link = ""
        var pubDate = ""
        var author = ""
        var description = ""
        var contentEncoded: String? = null

        var depth = 1
        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)

                    when (localName) {
                        "title" -> {
                            if (title.isEmpty()) {
                                title = collectText()
                                depth-- // collectText consumed through </title>
                            }
                        }
                        "link" -> {
                            if (link.isEmpty()) {
                                val rel = parser.getAttributeValue(null, "rel") ?: "alternate"
                                if (rel == "alternate" || rel == "") {
                                    val href = parser.getAttributeValue(null, "href") ?: ""
                                    if (href.isNotEmpty()) {
                                        link = href
                                    } else {
                                        link = collectText()
                                        depth-- // collectText consumed through </link>
                                    }
                                }
                            }
                        }
                        "published" -> {
                            if (pubDate.isEmpty()) {
                                pubDate = collectText()
                                depth-- // collectText consumed through </published>
                            }
                        }
                        "updated" -> {
                            if (pubDate.isEmpty()) {
                                pubDate = collectText()
                                depth-- // collectText consumed through </updated>
                            }
                        }
                        "author" -> {
                            if (author.isEmpty()) {
                                author = parseAuthorElement()
                                depth-- // parseAuthorElement consumed through </author>
                            }
                        }
                        "summary" -> {
                            if (description.isEmpty()) {
                                description = collectText()
                                depth-- // collectText consumed through </summary>
                            }
                        }
                        "content" -> {
                            if (contentEncoded == null) {
                                contentEncoded = collectText()
                                depth-- // collectText consumed through </content>
                            }
                        }
                        else -> { /* unknown tag, depth++ already done */ }
                    }
                }
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
            }
        }

        items.add(FeedContentItem(
            title = title,
            link = link,
            pubDate = pubDate,
            author = author,
            description = description,
            contentEncoded = contentEncoded
        ))
    }

    private fun parseAuthorElement(): String {
        var author = ""
        var depth = 1

        while (depth > 0) {
            val eventType = parser.next()

            when (eventType) {
                XmlPullParser.START_TAG -> {
                    depth++
                    val localName = (parser.name ?: "").lowercase(Locale.US)
                    if (localName == "name" && author.isEmpty()) {
                        author = collectText()
                        depth-- // collectText consumed through </name>
                    }
                }
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
            }
        }

        return author
    }

    /**
     * Collects all text content within the current element (TEXT + CDATA + nested text),
     * advancing the parser past the matching END_TAG. This matches fast-xml-parser's
     * behavior of concatenating all text children.
     */
    private fun collectText(): String {
        val sb = StringBuilder()
        var depth = 1
        while (depth > 0) {
            when (val ev = parser.next()) {
                XmlPullParser.TEXT, XmlPullParser.CDSECT -> {
                    sb.append(parser.text ?: "")
                }
                XmlPullParser.START_TAG -> depth++
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.END_DOCUMENT -> break
                else -> { /* ignore */ }
            }
        }
        return sb.toString()
    }
}
