# TODO

Technical debt and follow-ups collected while building the feed refresh worker
(Stages 1–2 of `docs/feed-refresh-worker-plan.md`). Nothing here blocks the
current flow; each item is safe to pick up independently.

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

- [ ] **Feed cache completeness status.** Deliberately deferred. If it is ever needed, it can be
      derived at render time by comparing a feed's snapshot URLs against cached articles rather
      than persisted as a boolean.

- [ ] **Per-feed failure UI.** Failures are already stored in `refresh_feeds.status`, but nothing
      surfaces them to the user yet.

- [ ] **Generation GC.** Superseded generations and their cascade-owned children accumulate with
      no cleanup. `ON DELETE CASCADE` is already in place, so this is a matter of deleting old
      `refreshes` rows while preserving the active and pending ones. Planned for Stage 4, together
      with removing the 300-article cap and its LRU policy.
