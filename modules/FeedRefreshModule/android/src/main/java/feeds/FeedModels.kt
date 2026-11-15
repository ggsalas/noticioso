package com.ggsalas.noticiosoandroid.feedrefresh.feeds

data class Feed(
    val id: String,
    val name: String,
    val url: String,
    val oldestArticle: Int,
    val lang: String
)

data class FeedContentItem(
    val title: String,
    val link: String,
    val pubDate: String,
    val author: String,
    val description: String,
    val contentEncoded: String?
)

data class Channel(
    val title: String,
    val description: String,
    val language: String,
    val link: String,
    val lastBuildDate: String,
    val item: List<FeedContentItem>
)

data class FeedData(
    val date: String,
    val feedType: String,
    val channel: Channel
)
