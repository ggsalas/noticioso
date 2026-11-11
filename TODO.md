# TODO

Open follow-ups. Finished work lives in git history and in `docs/architecture.md`
(current design); `docs/history/` keeps the original plans and stage reports.

## Product

- [ ] **Sites that reject article downloads (e.g. Ars Technica → HTTP 405).** Every Ars article
      download fails with `HTTP 405` (plain GET, no headers — most likely the site's bot
      protection). It behaved the same before the native pipeline. Do NOT try to bypass it by
      impersonating a browser. Preferred fix: when a download fails, open the article in a
      WebView/browser so the user reads the real site. Optional: send an honest app User-Agent
      (e.g. `Noticioso/1.0`) — common for RSS readers, no guarantee it is accepted.

- [ ] **Per-feed failure UI.** Failures are stored in `refresh_feeds.status` (and the failed feed
      keeps its last good content), but nothing tells the user a feed failed.

- [ ] **Shared URL completion counts.** When the same article URL appears in several feeds, only
      the first feed owns the download job; per-feed progress counts for the other feeds may not
      reflect that article's outcome.

## UI

- [ ] **Cold-start download progress isn't shown.** The first `onArticleDownloadFeedStarted` can
      be emitted before JS subscribes, so the header shows no "Fetching articles" while the
      initial reconciliation downloads. Downloads work; UI only. Option: on mount, if
      `FeedRefreshModule.isWorkerBusy()`, show a generic progress state.

- [ ] **Dev-only React warning on some cold starts:** "Can't perform a React state update on a
      component that hasn't mounted yet". Seen a few times with a slow Metro bundle; the stack
      does not name a component. Not investigated.

- [ ] **A feed disappeared from the list once right after applying the toast** (it was back after
      reopening the app; data was correct). Not reproduced in several retries. Most likely a JS
      read colliding with the native garbage collection write; `db/database.ts` now sets a busy
      timeout so reads wait instead of failing. If it shows up again, look at
      `FeedContentService.getArticleCounts` (a failed read omits the feed).

## Native module

- [ ] **No automated tests for the SQLite-backed Kotlin code** (`db/` stores,
      `ArticleDownloadWorker`, `ArticleGarbageCollector`, apply/clear). They need Android's
      SQLite (Robolectric or instrumentation). Today they are verified on the emulator with
      `scripts/android-test/at.sh`. The pure logic (parser, date filter, snapshot JSON, file
      names, metadata, JS↔native contracts) is covered by JVM unit tests.

## Housekeeping

- [ ] **Local Android SDK folders inside the repo root** (`build-tools/`, `platforms/`,
      `platform-tools/`, `licenses/`): git-ignored leftovers from an SDK install pointed at the
      repo. The SDK in use is `/opt/homebrew/share/android-commandlinetools`. Safe to delete from
      disk.
