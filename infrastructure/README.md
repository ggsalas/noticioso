# Infrastructure — Stage 2 Data Layer

Current Stage 2 storage design: how feeds, refresh generations, and article data are persisted across AsyncStorage, SQLite, and the filesystem.

## Storage split

| Store                                   | What lives here                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| AsyncStorage                            | Only `@noticioso-feedList` — the user-configured feed list                                      |
| SQLite (`noticioso.db`)                 | Refresh generations, feed payloads, per-feed status, pointers, fetch throttle, article metadata |
| Filesystem (`Paths.cache/article-html`) | Raw article HTML                                                                                |

Stage 1 caches (`feed_cache` / `last_full_refresh` / `migration_state`) were never shipped to production; they are cleaned once at startup (see Startup) and never rewritten.

The SQLite schema (version 3) is defined in [`./schema.ts`](./schema.ts).

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

  Article download jobs (refresh_id association; deleted explicitly during cache clear):
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
4. JS notices the pending pointer and shows an "update available" toast. **The active list stays visible unchanged until the user taps the toast.**
5. **Apply (toast tap) — one transaction**: mark the previous generation `superseded`, swap `active_refresh` to the pending id and mark it `applied`, clear `pending_refresh`.
6. JS reads the new data by joining `active_refresh` → `feed_snapshots`, so the UI flips atomically with the pointer swap.

Superseded generations and their cascade-owned children will later be garbage-collected (FKs already specify `ON DELETE CASCADE`).

## Articles

- Raw HTML is never stored in SQLite or AsyncStorage; it lives on the filesystem under `Paths.cache/article-html/<slug>.html`.
- `article_metadata` is **global, keyed by URL** — no FK to `refreshes`, because the same article URL is the same article regardless of which generation surfaced it.
- Metadata is populated by JS on demand when an article is opened.
- **Native article downloader** tracks per-refresh, per-URL download work in `article_download_jobs` (compound PK `refresh_id, url`, FK to `refreshes` with CASCADE). Status: pending → downloading → completed/failed. Used for reconciliation on foreground recovery.

## Startup

1. **Legacy cleanup** runs once (guarded by an AsyncStorage marker): it preserves `@noticioso-feedList` and removes only the never-in-production Stage 1 caches (legacy AsyncStorage keys, old `article-html` files, Stage 1 tables); if it fails it retries on the next startup.
2. `migrate.ts` then applies the V1 baseline schema.

There is **no legacy cache migration** — Stage 1 never shipped, so nothing is migrated; discarded caches are simply rebuilt by fetching.

## Stage 2–3 scope

- **Native (Kotlin)** fetches/parses feeds and then downloads article HTML; it persists refresh snapshots, per-feed status, and per-URL download jobs in SQLite.
- **JS** reads the active generation and applies a pending refresh only when the user taps the toast.
- **Top-5 preload is disabled**; article reads remain on-demand in JS and share the same filesystem/metadata cache.
- The cross-runtime on-demand/native same-URL race is accepted for now; both paths check the shared cache, but there is no global per-URL lock yet.
