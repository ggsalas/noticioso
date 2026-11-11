package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import java.io.StringReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.kxml2.io.KXmlParser
import org.xmlpull.v1.XmlPullParser

class FeedParserTest {

    private fun parse(xml: String): FeedData {
        val parser = KXmlParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
        parser.setInput(StringReader(xml))
        return FeedPullParserHandler(parser).parse()
    }

    @Test
    fun parsesRss2ChannelAndItems() {
        val feed = parse(
            """<?xml version="1.0"?>
            <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
              <channel>
                <title>My Feed</title>
                <link>https://example.com</link>
                <description>About things</description>
                <language>en</language>
                <lastBuildDate>Tue, 10 Nov 2026 10:00:00 +0000</lastBuildDate>
                <item>
                  <title>First</title>
                  <link>https://example.com/1</link>
                  <pubDate>Tue, 10 Nov 2026 09:00:00 +0000</pubDate>
                  <dc:creator>Jane</dc:creator>
                  <description>Short</description>
                  <content:encoded>Full body</content:encoded>
                </item>
                <item>
                  <title>Second</title>
                  <link>https://example.com/2</link>
                  <author>john@example.com</author>
                </item>
              </channel>
            </rss>"""
        )

        assertEquals("rss", feed.feedType)
        assertEquals("My Feed", feed.channel.title)
        assertEquals("https://example.com", feed.channel.link)
        assertEquals("About things", feed.channel.description)
        assertEquals("en", feed.channel.language)
        assertEquals(2, feed.channel.item.size)

        val first = feed.channel.item[0]
        assertEquals("First", first.title)
        assertEquals("https://example.com/1", first.link)
        assertEquals("Tue, 10 Nov 2026 09:00:00 +0000", first.pubDate)
        assertEquals("Jane", first.author)
        assertEquals("Short", first.description)
        assertEquals("Full body", first.contentEncoded)

        val second = feed.channel.item[1]
        assertEquals("john@example.com", second.author)
        assertEquals("", second.description)
        assertNull(second.contentEncoded)
    }

    @Test
    fun readsCdataAsText() {
        val feed = parse(
            """<rss version="2.0"><channel><title>T</title>
              <item>
                <title><![CDATA[Ampersands & <tags>]]></title>
                <link>https://example.com/cdata</link>
                <description><![CDATA[<p>Hello</p>]]></description>
              </item>
            </channel></rss>"""
        )

        val item = feed.channel.item.single()
        assertEquals("Ampersands & <tags>", item.title)
        assertEquals("<p>Hello</p>", item.description)
    }

    @Test(timeout = 5000)
    fun parsesAtomEntries() {
        val feed = parse(
            """<?xml version="1.0" encoding="utf-8"?>
            <feed xmlns="http://www.w3.org/2005/Atom">
              <title>Atom Feed</title>
              <link href="https://example.org/"/>
              <updated>2026-11-10T10:00:00Z</updated>
              <entry>
                <title>Entry one</title>
                <link rel="self" href="https://example.org/self"/>
                <link rel="alternate" href="https://example.org/one"/>
                <published>2026-11-10T09:00:00Z</published>
                <author><name>Ada</name><email>ada@example.org</email></author>
                <summary>Sum</summary>
                <content type="html">Body</content>
              </entry>
              <entry>
                <title>Entry two</title>
                <link href="https://example.org/two"/>
                <updated>2026-11-09T09:00:00Z</updated>
              </entry>
            </feed>"""
        )

        assertEquals("atom", feed.feedType)
        assertEquals("Atom Feed", feed.channel.title)
        assertEquals(2, feed.channel.item.size)

        val one = feed.channel.item[0]
        assertEquals("Entry one", one.title)
        assertEquals("https://example.org/one", one.link)
        assertEquals("2026-11-10T09:00:00Z", one.pubDate)
        assertEquals("Ada", one.author)
        assertEquals("Sum", one.description)
        assertEquals("Body", one.contentEncoded)

        val two = feed.channel.item[1]
        assertEquals("https://example.org/two", two.link)
        assertEquals("2026-11-09T09:00:00Z", two.pubDate)
    }

    @Test
    fun parsesRdfItemsOutsideChannel() {
        val feed = parse(
            """<?xml version="1.0"?>
            <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
              <channel>
                <title>RDF Feed</title>
                <link>https://rdf.example.com</link>
              </channel>
              <item>
                <title>RDF item</title>
                <link>https://rdf.example.com/1</link>
                <dc:creator>Rita</dc:creator>
              </item>
            </rdf:RDF>"""
        )

        assertEquals("rdf", feed.feedType)
        assertEquals("RDF Feed", feed.channel.title)
        val item = feed.channel.item.single()
        assertEquals("RDF item", item.title)
        assertEquals("https://rdf.example.com/1", item.link)
        assertEquals("Rita", item.author)
    }

    @Test
    fun channelImageDoesNotCutTheChannelShort() {
        // <image> repeats <title>/<link>; fields after it must still be read
        val feed = parse(
            """<rss version="2.0"><channel>
              <title>With image</title>
              <link>https://example.com</link>
              <image><url>https://example.com/logo.png</url><title>Logo</title><link>https://example.com/logo</link></image>
              <language>es</language>
              <lastBuildDate>today</lastBuildDate>
              <item><title>After image</title><link>https://example.com/a</link></item>
            </channel></rss>"""
        )

        assertEquals("With image", feed.channel.title)
        assertEquals("https://example.com", feed.channel.link)
        assertEquals("es", feed.channel.language)
        assertEquals("today", feed.channel.lastBuildDate)
        assertEquals(listOf("After image"), feed.channel.item.map { it.title })
    }

    @Test(timeout = 5000)
    fun atomAuthorWithNameDoesNotHangAndKeepsFollowingFields() {
        // Regression: <author><name> used to miscount depth, run past the end of
        // the document and loop forever (blocking the native worker).
        val feed = parse(
            """<feed xmlns="http://www.w3.org/2005/Atom">
              <title>T</title>
              <entry>
                <title>One</title>
                <author><name>Ada</name><uri>https://example.org/ada</uri></author>
                <link href="https://example.org/one"/>
                <summary>After author</summary>
              </entry>
              <entry><title>Two</title><link href="https://example.org/two"/></entry>
            </feed>"""
        )

        assertEquals(2, feed.channel.item.size)
        assertEquals("Ada", feed.channel.item[0].author)
        assertEquals("https://example.org/one", feed.channel.item[0].link)
        assertEquals("After author", feed.channel.item[0].description)
        assertEquals("Two", feed.channel.item[1].title)
    }

    @Test
    fun emptyChannelHasNoItems() {
        val feed = parse("""<rss version="2.0"><channel><title>Empty</title></channel></rss>""")

        assertEquals("Empty", feed.channel.title)
        assertTrue(feed.channel.item.isEmpty())
    }

    @Test
    fun malformedXmlThrows() {
        try {
            parse("""<rss><channel><title>Broken</channel></rss>""")
            fail("Expected a parse error")
        } catch (e: Exception) {
            // FeedFetcher turns any parse error into a failed feed
        }
    }
}
