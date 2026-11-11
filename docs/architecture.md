# Architecture — Noticioso (Android)

Current description of how the app is built. The original plans and reports of
each stage are in `docs/history/`; open items are in `TODO.md`.

## 1. The idea in one line

**One app with one boundary:** the native module (Kotlin) is the data pipeline
and the **only writer**; JS is UI, reads and user configuration.

**Why a native module:** downloading and parsing every feed and hundreds of
articles is heavy work. In JS it would compete with the UI for the same thread
and scrolling or page turns would stutter or freeze. The native module runs it
on its own background thread, so the UI stays responsive while new content is
prepared.

```
┌──────────────── JS (UI + reads + configuration) ───────────────────┐
│ app/  components/  providers/  hooks/                               │
│ services/  FeedService            the feed list (AsyncStorage)      │
│            FeedDiscoveryService   find feeds when adding one        │
│            FeedContentService     reads the active generation       │
│            ArticleService         reads articles; if missing → native│
│            FeedRefreshService     triggers refresh / applies / 1h   │
│ db/        schema + migrations + READ-ONLY repositories             │
└───────────────────────────────┬─────────────────────────────────────┘
      Native API (the only way to write)
      refreshFeeds · applyPendingRefresh · downloadArticle(url)
      reconcileArticleDownloads · collectGarbage · clearCaches
      isWorkerBusy  +  progress events
┌───────────────────────────────┴─────────────────────────────────────┐
│ Kotlin  modules/FeedRefreshModule/android/src/main/java/            │
│   FeedRefreshModule.kt   only defines functions and events          │
│   worker/   one thread that runs everything in order                │
│   feeds/    fetch + parse feeds → new generation                    │
│   articles/ download articles, cleanup (GC)                         │
│   db/       all the SQL                                             │
└─────────────────────────────────────────────────────────────────────┘
   SQLite noticioso.db (generations, snapshots, jobs, metadata)
   + article HTML in <cache>/article-html/
```

Rule of thumb: **if native already does it, JS does not reimplement it**
(fetching feeds, downloading articles, extracting metadata, writing tables).
Add or extend a native function instead.

## 2. Where each piece of data lives

| Where | What | Who writes |
| --- | --- | --- |
| AsyncStorage `@noticioso-feedList` | The user's feed list | JS |
| SQLite `noticioso.db` | Generations, feed snapshots, per-feed status, active/pending pointers, last fetch, article metadata, download jobs | Native |
| Files `<cache>/article-html/` | HTML of each article | Native |

The schema and migrations belong to JS (`db/schema.ts`, `db/migrate.ts`) and run
at startup, before native is used. Tables and relations: `db/README.md`.

## 3. Concepts

- **Generation**: one complete pass over all feeds (a row in `refreshes`).
  States: `building` → `ready` → `applied` → `superseded`.
- **Active**: the generation the user sees. **Pending**: a `ready` generation
  waiting for the user to tap the toast.
- The user **keeps seeing the active one** until they tap the "Load new available
  articles" toast; they never see a half-built generation.

## 4. Flows

### Refresh
1. Triggered on app open and on return to the foreground **if the last fetch is
   more than 1 hour old**, or manually with the ⟳ button. An unapplied pending
   generation does **not** block it: old news is useless.
2. Native creates a generation, fetches and parses each feed and stores its
   snapshot. A feed that fails is marked as failed and **carries forward** its
   last good snapshot. There are no automatic retries.
3. The generation becomes `ready` and pending (an older unapplied pending one
   becomes `superseded`). JS shows the toast.
4. Native then downloads the articles of that generation, one by one.

If the worker is busy when a refresh is requested, the request is **queued**
(never dropped) and runs when the current work finishes.

### Apply (toast tap)
`applyPendingRefresh` swaps the pointers atomically (pending → active, the
previous active → `superseded`). It runs immediately, without waiting for a
download in progress. Then it queues the cleanup.

### Article download
- **Bulk**: after each feed pass. One job per URL in `article_download_jobs`; a
  URL that appears in several feeds is downloaded once. Download to a temp file
  + atomic rename, and metadata (image, author, title, excerpt) to SQLite.
  Progress is reported feed by feed ("Downloading articles for feed 2/3").
- **If the app dies mid-download**: on open or return to the foreground,
  `reconcileArticleDownloads` resumes unfinished jobs.
- **On demand** (`downloadArticle`): when the user opens an article that is not
  cached (including the `shared/` route). Same download code, but outside the
  serial worker so the reader does not wait behind a bulk download.
- An article counts as cached when it has **metadata and a file**.
- The indicator next to a feed appears once **every article** of that feed in
  the active generation **was attempted** (each job ended `completed` or
  `failed`): **●** if at least one was downloaded, **○** if all failed (e.g. a
  site that rejects downloads). After applying a new generation no feed has it
  until its downloads are attempted. It is derived on demand from
  `article_download_jobs`, not stored.

### Cleanup (GC)
Runs after every apply and once on app open (in case a previous cleanup was
interrupted; safe to repeat). Keeps only the active and pending generations and
the articles they reference; deletes the rest: old generations with their child
rows, orphan metadata and HTML files, and temp files of interrupted downloads.
- Rows first (one transaction), then files.
- If some feed snapshot cannot be read, no articles are deleted.
- An article opened on demand that is in no feed is kept during the current
  session and deleted in a later one.

### Clear caches (Settings)
`clearCaches` clears the tables immediately (a running download notices and stops
at its next article) and then, on the worker, deletes the files. The feed list is
not touched.

## 5. The native worker

`worker/SerialWorker.kt`: **a single thread** runs feed refresh, bulk downloads,
reconciliation and cleanup, one task at a time, in arrival order.
- Repeated requests of the same kind do not pile up in the queue.
- When the queue drains it emits `onArticleWorkerIdle`. It is the guaranteed
  final event: the UI uses it to turn off progress indicators even if an
  intermediate event was lost.
- Events are notifications; the source of truth is SQLite and the files. The UI
  recomputes when the screen gets focus.

Deliberately outside the worker: `applyPendingRefresh` (immediate),
`downloadArticle` (on demand) and the first step of `clearCaches`. On-demand
downloads and cleanup are coordinated in `articles/OnDemandDownloads.kt`.

## 6. Contracts between JS and Kotlin

Both sides share a database and a folder of files. What they must compute the
same way is pinned in `modules/FeedRefreshModule/contract/` and read by a Jest
test **and** a Kotlin test, so changing only one side breaks a test instead of
silently breaking the app:

| File | What it pins |
| --- | --- |
| `database.json` | Folder and name of the database (`SQLite/noticioso.db`) |
| `article-file-names.json` | Article folder and file name for each URL |
| `feed-snapshot.json` | The JSON native stores in `feed_snapshots.data` and JS reads |

## 7. Folder map

```
app/          routes (expo-router)                __tests__/   screen tests
components/   providers/   theme/   types/
hooks/        useRefreshLifecycle (refresh cycle, progress, toast)
              useFeedCacheStatus (counts and ● / ○ indicator), useFeedContent, ...
services/     JS logic (one class + singleton per file, dependencies via constructor)
db/           SQLite from JS: schema, migrations, read-only repositories
lib/          pure helpers; lib/webview/ = scripts that run INSIDE the WebView
modules/FeedRefreshModule/
  src/                       JS bindings, types, events.ts, web stub
  contract/                  shared contracts
  android/src/main/java/     Kotlin (worker/ db/ feeds/ articles/)
  android/src/test/java/     Kotlin unit tests
scripts/android-test/        scripts to drive the app on an emulator
docs/                        this document; history/ = old plans and reports
```

## 8. How to verify a change

```bash
npx jest --runInBand        # JS tests (Node 22.5+; the node:sqlite warning is expected)
npx tsc --noEmit
npm run lint
./android/gradlew -p android :feed-refresh-module:testDebugUnitTest   # Kotlin tests (JVM)
```

On an emulator: `npm run android:emulator` builds, installs and opens the app
with Metro (JS changes hot-reload; Kotlin changes need running it again). For
scripted checks (details in `AGENTS.md`, "Emulator Testing"),
`scripts/android-test/at.sh` opens, backgrounds or kills the app, shows the
database state (`state`), simulates elapsed time (`stale 2`) and takes
screenshots.

Not covered by automated tests and verified on the emulator: the Kotlin code
that uses SQLite (stores, download worker, cleanup, apply, clear caches).

## 9. Known pitfalls

1. **Changing a contract on one side only** (database name, article file name,
   snapshot format): change both sides and the file in `contract/`.
2. **`article_metadata` is global per URL**, unrelated to generations; that is
   why cleanup decides by references from snapshots, not by generation.
3. **Failed jobs are not retried.** If that changes, review reconciliation and
   the feed indicator.
4. **Do not treat events as state**: if JS was not listening, they are lost.
5. **Native does not use `ON DELETE CASCADE`**: it deletes child rows explicitly.
6. **Sites that reject downloads** (e.g. Ars Technica, HTTP 405): their articles
   stay failed (the feed shows ○). Bypassing that protection is not attempted
   (see `TODO.md`).
