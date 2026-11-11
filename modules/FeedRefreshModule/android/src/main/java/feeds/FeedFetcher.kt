package com.ggsalas.noticiosoandroid.feedrefresh.feeds

import android.util.Xml
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import org.xmlpull.v1.XmlPullParser

/**
 * Downloads one feed, parses it and drops items older than the feed's
 * `oldestArticle` window. Returns null on any network/parse failure.
 */
fun fetchAndParseFeed(feed: Feed): FeedData? {
    return try {
        val url = URL(feed.url)
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10000
        connection.readTimeout = 10000

        if (connection.responseCode !in 200..299) {
            connection.disconnect()
            return null
        }

        val inputStream: InputStream = connection.inputStream
        val feedData = parseXml(inputStream, feed)
        inputStream.close()
        connection.disconnect()

        // Filter by oldestArticle
        val filteredItems = filterFeedItemsByDate(feedData.channel.item, feed.oldestArticle)
        feedData.copy(
            channel = feedData.channel.copy(item = filteredItems)
        )
    } catch (e: Exception) {
        null
    }
}

private fun parseXml(inputStream: InputStream, feed: Feed): FeedData {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
    parser.setInput(inputStream, null)
    val handler = FeedPullParserHandler(parser)
    return handler.parse()
}
