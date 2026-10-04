package com.ggsalas.noticiosoandroid.feedrefresh

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

class FeedRefreshModule : Module() {
  // Guard to prevent duplicate concurrent runs, even from direct API calls
  private val isRunning = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("FeedRefreshModule")

    // AsyncFunction that fetches all feed URLs off the JS thread
    // Returns a concise summary of successes and failures
    AsyncFunction("refreshFeeds") { urls: List<String> ->
      // Native-side duplicate-run guard
      if (!isRunning.compareAndSet(false, true)) {
        return@AsyncFunction "Refresh already in progress"
      }

      try {
        var successCount = 0
        var failureCount = 0

        for (urlString in urls) {
          try {
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000 // 10 seconds
            connection.readTimeout = 10000 // 10 seconds
            
            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
              successCount++
            } else {
              failureCount++
            }
            connection.disconnect()
          } catch (e: Exception) {
            failureCount++
          }
        }

        "${successCount} feeds downloaded successfully, ${failureCount} failed"
      } finally {
        isRunning.set(false)
      }
    }
  }
}
