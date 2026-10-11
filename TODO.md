# TODO

Technical debt and follow-ups collected while building the feed refresh worker
(Stages 1–3 of `docs/feed-refresh-worker-plan.md`). Nothing here blocks the
current flow; each item is safe to pick up independently.

## Stage 3 Completion (2026-10-06)

**Completed:**
- Schema v2 → v3 migration: Changed `article_download_jobs` primary key from `(url)` to `(refresh_id, url)` compound key
- Added `position` column to `refresh_feeds` for configured feed ordering
- Native Kotlin article downloader: Fixed `extractLinksFromJson()` to use org.json.JSONObject and parse only rss.channel.item[].link
- Fixed feed iteration order to preserve configured feed order using refresh_feeds position/rowid
- Fixed `reconcileIncompleteJobs()` to handle active (applied) and pending refreshes correctly
- Added relevance checks during article processing to stop work when refresh becomes superseded
- Added initial reconciliation call on app launch after dbReady (handles app launching in active state)
- Implemented module-level article worker queue to serialize refreshIds and prevent overlapping workers
- Added temp file cleanup at worker start to remove orphan article-*.html.tmp files
- Added race condition handling in ArticleDownloader for concurrent final file creation
- Removed JS ArticleDownloadJobRepository: Kotlin directly owns article_download_jobs table; JS receives progress via per-feed events
- Updated useFeedContent hook to subscribe to onArticleDownloadFeedComplete events and refresh visible feed
- Replaced the handwritten SQL mock with a real SQLite engine for Jest migration tests (see README and infrastructure/testing/)
- Removed `MAX_ARTICLES=300` limit from `ArticleCacheService` (deferred GC to Stage 4)
- Event subscription: Native module emits onArticleDownloadFeedComplete per feed after article downloads with feedIndex, feedCount, articleCount, articleSuccessCount, articleFailedCount
- Added clearArticleDownloadJobs() native method to FeedRefreshModule for StorageService.clearCaches()
- FeedsProvider now tracks transient articleDownloadProgress state from per-feed events (not persisted)

## Stage 3 UI Enhancement (2026-10-10)

**Completed:**
- Added `onArticleDownloadFeedStarted` native event with refreshId/feedCount/articleCount, emitted before processing a feed's articles (including reconciliation)
- Updated FeedsProvider to track transient article download progress with status ('fetching' | 'complete')
- Updated feeds header to show "Updating feeds" during native fetch and "Fetching articles X/Y" during article processing
- Added filled circle indicator (●) next to feed names when all article URLs in active snapshot have both metadata row and final HTML file on disk
- Implemented derived cache completeness (not persisted): ArticleCacheRepository.getMetadataPresentUrls() bulk method with chunking, ArticleCacheService.getFullyCachedUrls() helper that filters by file existence
- FeedsProvider.computeFeedCacheCompleteness() recalculates on entering/returning to /feeds and after each per-feed native event
- Exposed refreshActiveFeedCacheState() callback in context, invoked via useFocusEffect on route focus
- Indicator shows only when feed has >=1 article and every URL has row + file; no icon for empty/missing/failed articles
- Removed inline body loading indicators for background work; initial loading text shown only when no feed data

**Stage 3 Recovery Fix (2026-10-06):**
- Fixed `reconcileIncompleteJobs()` to discover refresh IDs from `active_refresh` and `pending_refresh` pointers (not just job rows), catching the case where process dies after refresh is marked ready but before article jobs are inserted
- Changed `isRefreshStillRelevant()` from state-column check (`applied`/`ready`) to pointer-based check (matches `active_refresh.refresh_id` OR `pending_refresh.refresh_id`), preventing resumption of historical superseded work
- Added per-article relevance checks in both `downloadArticlesForRefresh()` and `processRefreshArticles()` so work stops promptly after toast applies a newer generation mid-run
- Preserved no-retry semantics: only `pending`/`downloading` jobs are resumed; `failed` jobs are not retried

**Known limitations:**
- JS on-demand vs native download race: Accepted as low-probability cross-runtime race. No per-URL locks yet.
  Uses file+metadata checks and native queue URL dedupe. Documented in plan addendum.
- Kotlin parser/downloader instrumentation tests not implemented: Would require Android emulator/Robolectric setup.
  Manual device testing required per checklist below.
- Shared URL completion counts: When a URL is shared across feeds and fails, the failure is reflected in the job but
  feed completion counts may not accurately reflect shared outcomes. This is acceptable for Stage 3.

**Deferred to Stage 4:**
- Orphan GC: Delete article HTML files with no references in active/pending refreshes
- Shared URL outcome reflection: Improve feed completion counts to reflect shared cached/job outcomes

## Kotlin native module

- [ ] **Split `FeedRefreshModule.kt` (~670 lines) into focused files.** It currently mixes four
      responsibilities: module definition (`AsyncFunction`), HTTP fetching, XML parsing, and
      direct SQLite writes.
      Suggested layout:

      ```text
      android/src/main/java/.../feedrefresh/
      ├── FeedRefreshModule.kt        # module definition + function signatures only
      ├── FeedFetcher.kt              # HTTP
      ├── FeedParser.kt               # XML -> FeedData
      ├── FeedSnapshotWriter.kt       # SQLite writes
      └── ArticleMetadataExtractor.kt # added in Stage 3
      ```

- [ ] **Extract the parser first and give it real unit tests.** `FeedPullParserHandler` is the
      highest-value split: it has the most logic and is currently untestable in isolation (you
      cannot exercise it without booting the module). It needs fixture-based tests for RSS,
      Atom, RDF, CDATA, malformed and empty feeds — plus parity tests against the JS
      `lib/feedSchema.ts` normalization contract (feed type detection, author normalization,
      `oldestArticle` filtering).

## Dead / incomplete code left over from Stage 2

- [ ] **`FeedCacheService.delete()` is a no-op.** It looks up `pendingRefreshRepository` and then
      does nothing (`void url` plus a TODO). Called from `FeedService.deleteFeed()`, so deleting a
      feed leaves its snapshot rows behind. Not user-visible today because the UI filters by the
      configured feed list, but the rows accumulate with no cleanup path.

- [ ] **The JS fetch path for feeds is dead.** `FeedService.fetchFeedBasic()`,
      `fetchAllFeeds()` and `fetchAndCacheAllFeedsRanked()` have no callers outside
      `FeedService.ts` itself. Kotlin owns feed fetching now. Delete them once Stage 2 is
      validated, or keep only what Stage 3 actually needs.

- [ ] **`FeedCacheService.setLastFullRefresh()` is a deprecated no-op** that only logs a warning.
      `applied_at` is written by `ActiveRefreshRepository.set()` during toast apply. Remove the
      method and its test.

## `infrastructure/` organization

- [ ] **Adopt an explicit technology convention.** The directory currently mixes SQLite
      repositories with `legacy/LegacyCacheCleanup.ts` (which touches AsyncStorage and the
      filesystem). Suffixes are ambiguous — `CacheService` vs `CacheRepository` vs `CacheStore`
      doesn't reveal the technology — so prefer subfolders:

      ```text
      infrastructure/
      ├── sqlite/         # database.ts, schema.ts, migrate.ts, *Repository.ts
      ├── filesystem/     # *Store.ts
      └── legacy/
      ```

      Naming rule: `*Repository` = CRUD over a table, `*Store` = access to something outside SQL.

- [ ] **Move HTML file handling into `infrastructure/filesystem/`.** Today
      `services/ArticleCacheService.ts` owns both file writes (`expo-file-system`) and business
      logic (metadata extraction, cache eviction). Split so the service holds business rules and
      the store owns disk I/O.

- [ ] **Add a test that pins the resolved SQLite path.** `DATABASE_NAME` in
      `infrastructure/database.ts` (or `infrastructure/sqlite/database.ts` after the split) is what
      lets Kotlin and JS open the same app-private file. Renaming or moving it breaks the native
      worker **silently** — no compile error, no test failure. Worth locking down with a test that
      asserts the resolved path and the fact that it matches what the Kotlin module opens
      (`filesDir/SQLite/noticioso.db`).

## Product decisions still open

- [x] **Feed cache completeness status.** Implemented as derived value at render time by comparing a feed's active snapshot URLs against cached articles (metadata + HTML file). No persisted boolean - computed on route focus and after each per-feed native event. Indicator shows filled circle when complete, hidden when incomplete or when feed has zero articles.

- [ ] **Per-feed failure UI.** Failures are already stored in `refresh_feeds.status`, but nothing surfaces them to the user yet.

- [ ] **Generation/article GC.** Superseded generations, their feed snapshots/statuses, and article HTML/metadata with no feed references accumulate. Stage 4 should preserve active/pending generations and delete orphan articles after apply. The 300-item cap and LRU were removed in Stage 3. Check/enforce SQLite foreign-key behavior or explicitly delete child rows during GC.
