# db — storage design

How feeds, refresh generations and article data are persisted across AsyncStorage, SQLite and the filesystem.

**Who writes what:** the native module (`modules/FeedRefreshModule`) is the only writer of the SQLite tables below and of the article HTML files. This folder owns the schema (ensured at startup, before native is used; there are no migrations, see below) and READ-only repositories: `RefreshRepository` (active/pending pointers, last fetch), `FeedSnapshotRepository`, `ArticleMetadataRepository`. The whole design is described in `docs/architecture.md`.

## Storage split

| Store                                   | What lives here                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| AsyncStorage                            | Only `@noticioso-feedList` — the user-configured feed list                                      |
| SQLite (`noticioso.db`)                 | Refresh generations, feed payloads, per-feed status, pointers, fetch throttle, article metadata |
| Filesystem (`Paths.cache/article-html`) | Raw article HTML                                                                                |

The SQLite schema is defined in [`./schema.ts`](./schema.ts) and its version is stored in SQLite's `PRAGMA user_version`.

## Tables

```
AsyncStorage: @noticioso-feedList  (user feeds; drives which URLs to fetch)

                  +---------------------+
                  |    refreshes (1)    |   one row per generation
                  +---------------------+
                      |            |
              1 to N  |            |  1 to N
                      v            v
         +----------------+    +----------------+
         | refresh_feeds  |    | feed_snapshots |
         |       (N)      |    |       (N)      |
         | FK -> refreshes|    | FK -> refreshes|
         | ON DELETE      |    | ON DELETE      |
         |     CASCADE    |    |     CASCADE    |
         +----------------+    +----------------+

  Pointers to a generation (one row each, id = 1):
    active_refresh (1)   --points to--> refreshes   [refresh_id: FK]
    pending_refresh (1)  --points to--> refreshes   [refresh_id: nullable, NO FK]

  Standalone (no FK to refreshes):
    last_fetch_completion (1)  -- fetch throttle: stale after 1h?
    article_metadata (url PK)  -- GLOBAL by URL
        |
        +--> raw HTML: Paths.cache/article-html/<slug>.html

  Article download jobs (per generation; deleted explicitly with their generation):
    article_download_jobs (PK: refresh_id, url)
      -- per-refresh, per-URL download tracking for the native article downloader
      -- status: pending | downloading | completed | failed
      -- indexes on refresh_id, status, url
```

## Refresh lifecycle

A refresh is one immutable generation that fetches and parses **all** configured feeds. The user never sees a half-built generation.

```
[building] --all feeds processed--> [ready] --toast tap/apply--> [applied] --a newer refresh is applied--> [superseded]
```

Arrows are state transitions; `superseded` is not an alternative at creation — a generation reaches it only after being `applied`.

1. **building** — the native module opens a new `refreshes` row.
2. As each feed finishes, it writes `feed_snapshots` (payload) and `refresh_feeds` (status). A failed feed carries over the last good snapshot so the generation is still complete.
3. **ready** — once all feeds are done, the generation is marked `ready`, the singleton `pending_refresh` pointer is set, and `last_fetch_completion` is updated.
4. JS notices the pending pointer and shows an "update available" toast. **The active list stays visible unchanged until the user taps the toast.** If there is no active generation (empty screen), native applies the new one right away instead.
5. **Apply (toast tap) — one native transaction** (`applyPendingRefresh`): mark the previous generation `superseded`, swap `active_refresh` to the pending id and mark it `applied`, clear `pending_refresh`.
6. JS reads the new data by joining `active_refresh` → `feed_snapshots`, so the UI flips atomically with the pointer swap.
7. **Garbage collection** runs right after the apply (and once at app start): every generation except the active and pending ones is deleted with its child rows, plus article metadata and HTML files no kept snapshot references. Child rows are deleted explicitly; the native connection does not rely on `ON DELETE CASCADE`.

A new feed pass can also replace an unapplied pending generation (it becomes `superseded` without ever being applied): news older than an hour is refreshed even if the user never tapped the toast.

## Articles

- Raw HTML is never stored in SQLite or AsyncStorage; it lives on the filesystem under `Paths.cache/article-html/<slug>.html`.
- `article_metadata` is **global, keyed by URL** — no FK to `refreshes`, because the same article URL is the same article regardless of which generation surfaced it.
- Articles are downloaded by the native module only: in bulk after each feed pass (tracked per generation and URL in `article_download_jobs`, status pending → downloading → completed/failed, resumed after process death, failed jobs never retried) and one by one when the user opens an article that is not cached (`downloadArticle`).
- An article counts as cached when it has BOTH a metadata row and its HTML file.

## Startup

1. **Legacy cleanup** runs once (guarded by an AsyncStorage marker): when upgrading from the released app (`main`, which kept its caches in AsyncStorage) it removes those cache keys and the old `article-html` files, and preserves `@noticioso-feedList`. If it fails it retries on the next startup. Temporary: see `TODO.md`.
2. `ensureSchema.ts` makes sure the database has the current schema (see "No migrations").

## No migrations

The database is **a cache, not a source of truth**. Everything in it (generations, feed snapshots, article metadata, download jobs) is rebuilt by the native module on the next refresh. The only data that cannot be recreated, the user's feed list, lives in AsyncStorage and is never touched by schema changes.

So the schema is not migrated, it is rebuilt:

- `schema.ts` holds the one current schema and `SCHEMA_VERSION`.
- At startup `ensureSchema()` compares `SCHEMA_VERSION` with `PRAGMA user_version`. Same version: nothing to do. Different version (or a new install): drop every table, create the current schema, store the version.
- **To change the schema:** edit `schema.ts`, bump `SCHEMA_VERSION`, and update the native SQL if it uses the changed tables. Do not write a migration.

Why: migrations are code that must stay correct forever for data that is worth nothing — it can be downloaded again. Rebuilding is one code path, always tested, and an old or half-migrated database can never break the app.

Cost: on the first start after a schema change the feed list is empty until the refresh finishes (it starts right away, since the last fetch time is gone too). Old article HTML files become orphans and are removed by the garbage collection that runs at app start.

**When this stops being valid:** if the database ever stores something that cannot be downloaded again (read state, favorites, notes...), that data needs real migrations — or its own store, like the feed list.
