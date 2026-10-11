# Stage 2 Implementation Report - Feed Refresh Worker

## Important Note (2026-10-05)

**Stage 1 was never deployed to production.** The initial implementation included migration logic from AsyncStorage to SQLite (feed_cache, last_full_refresh, data_migrations tables), but this code never reached production users.

**What changed:** On 2026-10-05, we replaced the Stage 1 migration approach with a clean baseline:
- Removed all Stage 1 migration logic (`migrateFromAsyncStorage`, legacy repositories)
- Implemented destructive one-time cleanup (`infrastructure/legacy/LegacyCacheCleanup.ts`)
- Preserved only `@noticioso-feedList` (user's feed list)
- Deleted all other legacy caches without migration

See `docs/feed-refresh-worker-plan.md` section 10 for full details.

The Stage 2 implementation described below remains accurate for the current architecture.

## Summary
Stage 2 implementation is complete. The native Android feed refresh system is now operational with SQLite persistence, refresh generations, and toast-based apply mechanism.

## Files Modified

### Infrastructure (SQLite Schema & Repositories)
- `infrastructure/schema.ts` - Updated to version 2 with refresh state tables
- `infrastructure/migrate.ts` - Added migration from v1 to v2, migrates existing feed_cache to initial active refresh
- `infrastructure/FeedCacheRepository.ts` - Updated to read from active refresh's feed_snapshots
- `infrastructure/RefreshRepository.ts` - New: manages refresh generations (building/ready/applied/superseded states)
- `infrastructure/FeedSnapshotRepository.ts` - New: stores parsed feed data per refresh
- `infrastructure/ActiveRefreshRepository.ts` - New: tracks which refresh is currently active
- `infrastructure/PendingRefreshRepository.ts` - New: tracks READY refresh waiting to be applied
- `infrastructure/LastFetchCompletionRepository.ts` - New: tracks when last fetch completed
- `infrastructure/index.ts` - Exported new repositories

### Native Module (Kotlin)
- `modules/FeedRefreshModule/src/FeedRefreshModule.types.ts` - Updated to accept Feed objects instead of URLs
- `modules/FeedRefreshModule/src/FeedRefreshModule.ts` - Updated wrapper to pass full Feed objects
- `modules/FeedRefreshModule/src/FeedRefreshModule.web.ts` - Updated web stub signature
- `modules/FeedRefreshModule/index.ts` - Exported toNativeFeedInput helper
- `modules/FeedRefreshModule/android/src/main/java/com/ggsalas/noticiosoandroid/feedrefresh/FeedRefreshModule.kt` - Complete rewrite:
  - Accepts List<Feed> objects (id, name, url, oldestArticle, lang)
  - Fetches feeds via HTTP (HttpURLConnection)
  - Parses RSS/Atom/RDF via XmlPullParser with namespace support
  - Normalizes to FeedData structure matching JS contract
  - Filters items by oldestArticle days
  - Creates refresh generation in SQLite
  - Persists feed snapshots and per-feed status
  - Carries forward last-good snapshots for failed feeds from active refresh
  - Marks refresh as READY when complete
  - Updates last_fetch_completion timestamp
  - Uses correct database path: context.filesDir/SQLite/noticioso.db

### Services
- `services/FeedService.ts` - Disabled top-5 article preloader (Stage 2 only)
- `services/FeedRefreshService.ts` - New: orchestrates native refresh flow
- `services/FeedRefreshService.test.ts` - New: comprehensive tests for refresh service

### Provider
- `providers/FeedsProvider.tsx` - Rewritten to:
  - Read from active refresh only
  - Show toast when READY pending refresh exists
  - Tap toast applies by switching active_refresh_id
  - Trigger refresh on foreground when no READY and last fetch > 1 hour
  - Use feedRefreshService for all refresh operations

### UI
- `app/feeds/index.tsx` - Updated to use feedRefreshService for header refresh button

### Tests & Mocks
- `jest.setup.js` - Added mocks for FeedRefreshModule and expo-sqlite
- `modules/FeedRefreshModule/src/__tests__/FeedRefreshModule.test.ts` - Updated tests for new Feed object signature

## Behavior Implemented

### Refresh Flow
1. **Trigger**: User taps header refresh button OR app comes to foreground with stale data (>1 hour)
2. **Native Execution**: Kotlin module fetches all feeds off JS thread
3. **Parsing**: RSS/Atom/RDF feeds parsed and normalized to match JS FeedData structure
4. **Persistence**: Each feed's snapshot saved to feed_snapshots table, status recorded in refresh_feeds
5. **Completion**: Refresh marked as 'ready', pending_refresh pointer set, toast shown
6. **Apply**: User taps toast → active_refresh switched in single transaction → old refresh superseded

### Error Handling
- Per-feed failures caught and stored as 'failed' status
- Failed feeds fall back to last good snapshot from previous refresh
- One bad feed doesn't break the entire list
- No user-visible failure UI yet (Stage 3+ concern)

### Data Compatibility
- FeedData structure matches JS normalization contract (feedType, rss.channel, date)
- Feed items include: title, link, pubDate, author, description, content:encoded
- Author normalization handles string/object formats
- oldestArticle filtering applied per feed

### Backward Compatibility
- Legacy feed_cache table preserved (not deleted)
- FeedCacheRepository falls back to legacy table if no active refresh exists
- Migration creates initial active refresh from existing feed_cache data
- All Stage 1 backup keys in AsyncStorage preserved

## Validation Results

✅ **TypeScript**: No compilation errors
✅ **Jest**: All tests passed
✅ **Lint**: No errors
✅ **FeedRefreshModule tests**: All passing with new Feed object signature
✅ **FeedRefreshService tests**: Comprehensive coverage of refresh flow
✅ **Android Build**: Successfully builds with assembleDebug

## Manual Test Steps

### Prerequisites
- Android device/emulator with app installed
- At least 2-3 feeds configured in the app

### Test 1: Initial Migration (if upgrading from Stage 1)
1. Install app with Stage 1 data (existing feed_cache in SQLite)
2. Launch app
3. Verify feeds still visible (data migrated to initial active refresh)
4. Check SQLite: `SELECT * FROM refreshes` should show one 'applied' refresh
5. Check: `SELECT * FROM feed_snapshots` should have entries for each feed URL

### Test 2: Native Feed Refresh
1. Open app to feeds screen
2. Tap refresh icon in header
3. Observe: refresh indicator appears, button disabled during refresh
4. Wait for completion (10-30 seconds depending on network)
5. Verify: "Last full update at X" timestamp updates in header
6. Check SQLite: new refresh in 'ready' state, feed_snapshots populated

### Test 3: Toast Display and Apply
1. After refresh completes (Test 2), verify toast appears
2. Tap toast
3. Verify: toast disappears immediately
4. Verify: active_refresh in SQLite updated to the new refresh ID
5. Verify: old refresh marked as 'superseded'
6. Verify: feeds still display correctly

### Test 4: Foreground Refresh Trigger
1. Refresh feeds (Tests 2-3)
2. Background the app
3. Wait >1 hour (or temporarily modify threshold to 1 minute for testing)
4. Bring app to foreground
5. Verify: automatic refresh triggers
6. Verify: toast appears when refresh completes

### Test 5: Partial Feed Failure
1. Configure one feed with invalid URL (e.g., "https://invalid.example.com/rss")
2. Keep other feeds valid
3. Trigger refresh
4. Verify: valid feeds refresh successfully
5. Verify: invalid feed marked as 'failed' in refresh_feeds table
6. Verify: UI still shows valid feeds
7. Verify: failed feed shows last good snapshot (if exists)

### Test 6: Duplicate Run Guard
1. Tap refresh button rapidly multiple times
2. Verify: only one refresh executes (native guard prevents duplicates)
3. Check SQLite: only one 'building' or 'ready' refresh created

### Test 7: Top-5 Preloader Disabled
1. Refresh feeds
2. Check ArticlePreloader logs: should NOT see "Preloading articles" messages
3. Verify: article cache not populated automatically
4. Verify: articles still load on-demand when tapped (ArticleService unchanged)

### Test 8: Backward Compatibility
1. Verify existing feeds display correctly
2. Verify feed article counts show in UI
3. Verify navigation to individual feeds works
4. Verify shared article route still functions

## Database Schema Changes

### New Tables (v2)
```sql
CREATE TABLE refreshes (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL, -- 'building', 'ready', 'applied', 'superseded'
  created_at TEXT NOT NULL,
  completed_at TEXT,
  applied_at TEXT,
  superseded_at TEXT
);

CREATE TABLE refresh_feeds (
  refresh_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failed'
  error_message TEXT,
  items_count INTEGER,
  completed_at TEXT,
  PRIMARY KEY (refresh_id, feed_url),
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id)
);

CREATE TABLE feed_snapshots (
  refresh_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON FeedData
  cached_at TEXT NOT NULL,
  PRIMARY KEY (refresh_id, feed_url),
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id)
);

CREATE TABLE active_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_id TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id)
);

CREATE TABLE pending_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_id TEXT,
  ready_at TEXT
);

CREATE TABLE last_fetch_completion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL
);
```

## Known Limitations (Deferred to Stage 3+)

1. **Article Downloads**: Native article downloader not implemented (Stage 3)
2. **Failure UI**: No user-visible UI for failed feeds yet
3. **Garbage Collection**: Old refreshes not cleaned up (Stage 4)
4. **Background Execution**: Refresh only runs when app is foregrounded
5. **Retry Logic**: No automatic retry for failed feeds

## Next Steps

Awaiting user approval to proceed to Stage 3: Native Article Downloader

Stage 3 will:
- Download all article HTML bodies in Kotlin after feed refresh
- Persist article metadata in SQLite
- Store HTML files in filesystem
- Reconcile temp files on crash recovery
- Implement deduplication by URL
