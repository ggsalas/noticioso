# Noticioso Android - Agent Guidelines

## Git

- NEVER run git commands that modify state (no git add, git commit, git push, git rebase, git reset, git merge, nothing that changes history or index)
- Read-only git commands are allowed (git log, git diff, git show, git status, git branch)
- NEVER create commits or interact with git in any way that modifies the repo
- The user manages git exclusively

## Build/Test/Lint Commands

- `npm run lint` - Run Expo linter
- `npx jest --runInBand` - Run all Jest tests once (`npm test` runs them in watch mode; single test: `npm test -- --testNamePattern="test name"`)
- `npx tsc --noEmit` - Type check
- `./android/gradlew -p android :feed-refresh-module:testDebugUnitTest` - Kotlin unit tests of the native module (JVM, no device)
- `npm start` - Start Expo dev server
- `npm run android` - Start on Android device
- `npm run android:emulator` - Build + install the debug app on the local AVD `noticioso-test` and start Metro (JS hot-reloads; rerun after Kotlin/native changes). `npm run android:emulator:prebuild` regenerates `android/` first (after app.json / plugin / native dependency changes)
- `npm run ios` - Start on iOS device

## Architecture: one app, one boundary

Full description: `docs/architecture.md`. The rule that matters:

- **The native module (`modules/FeedRefreshModule`, Kotlin) is the data pipeline and the ONLY writer** of feed/article data: it fetches and parses feeds, downloads articles, applies generations, garbage-collects and clears caches.
- **JS is UI + reads + user configuration.** It reads SQLite and the article files, and calls native functions to change anything. The user's feed list lives in AsyncStorage and is owned by JS.
- Do NOT add a JS implementation of something native already does (fetching feeds, downloading articles, extracting metadata, writing generation tables). Add or extend a native function instead.
- What both sides must agree on (database path, article file names, snapshot JSON) is pinned by shared fixtures in `modules/FeedRefreshModule/contract/`, checked by a Jest test and a Kotlin test.

## Project Structure

- React Native Expo app with TypeScript; Expo Router for navigation
- Path aliases: `@/*` and `~/*` point to project root

```
app/          Routes (expo-router). Tests cannot live here (they would become routes) -> __tests__/
components/   UI components
providers/    React context (FeedsProvider composes the hooks below)
hooks/        useRefreshLifecycle (refresh cycle + progress + toast), useFeedCacheStatus, ...
services/     JS logic, one class + singleton each (see below)
db/           SQLite from JS: schema, migrations, READ-only repositories
lib/          Pure helpers (feedSchema, timeFormatters, url); lib/webview/ = scripts that run INSIDE the WebView
theme/ types/
modules/FeedRefreshModule/
  src/        JS bindings, types, events.ts (native event subscriptions), web stub
  contract/   Fixtures shared by Jest and Kotlin tests
  android/src/main/java/   Kotlin: FeedRefreshModule.kt (API only) + worker/ db/ feeds/ articles/
  android/src/test/java/   Kotlin unit tests
scripts/android-test/      Emulator harness (see "Emulator Testing")
docs/         architecture.md (current), history/ (old plans and reports)
```

## Service Layer Architecture

Services encapsulate JS logic and data access. Each service is a class with a singleton export:

```
services/
  StorageService.ts          -- AsyncStorage abstraction; clearCaches() delegates to native
  FeedService.ts             -- The user's feed list (CRUD, import/export) in AsyncStorage
  FeedContentService.ts      -- Reads the active generation: feed content, article counts, the ● "downloads attempted" indicator
  FeedRefreshService.ts      -- Triggers native refresh, applies the pending generation, 1h staleness
  ArticleService.ts          -- Reads cached articles (HTML file + metadata); asks native to download when missing
  FeedDiscoveryService.ts    -- Find RSS feeds from websites (used when adding a feed)
```

- Dependencies are injected via constructor WITHOUT default values
- The singleton export passes all required dependencies explicitly (e.g. `export const feedContentService = new FeedContentService(articleService)`)
- Tests instantiate the class directly with mock dependencies instead of using `jest.mock()`
- IMPORTANT: Do NOT use default values in constructor parameters for classes with singleton exports - this can cause initialization order issues in JavaScript modules

## Code Style

- TypeScript with strict mode enabled
- Named exports preferred over default exports for components
- Props destructured in function parameters with explicit types
- camelCase for variables/functions, PascalCase for components/types
- Import order: external libraries first, then local imports with `@/` or `~/`
- Use React hooks following hooks rules (useState, useEffect, custom hooks)
- Type definitions in `types/index.ts` with explicit type exports
- Async functions return `Promise<boolean | undefined>` for success/failure states

## Dependency Updates

- Try updating without flags first: `npm install`
- If peer dependency conflicts occur, use `--legacy-peer-deps` as last resort
- After major Expo updates, check these common breaking changes:
  - expo-file-system: Uses new File/Directory/Paths API instead of namespace exports
  - @react-navigation/native: Theme type requires `fonts` property
  - InteractionManager: Deprecated in React Native, use setTimeout instead

## WebView HTML Embedding

- Raw HTML is embedded inside a `<script id="raw-html" type="text/json">` tag in the WebView page
- The HTML is **base64 encoded** before embedding because raw HTML can contain `</script>` which breaks the container tag
- We already tried escaping with `content.replace(/<\/script/gi, '<\\/script')` and it did NOT work — articles rendered blank
- An alternative to base64 would be stripping `<script>` tags from the HTML before embedding, but base64 is more robust
- The encoding is done in `lib/webview/horizontalNavigation/index.js` and decoded in `lib/webview/articleParser.js`

## Emulator Testing (agents can verify on-device by themselves)

A local AVD `noticioso-test` (android-36, `google_apis` arm64 image — allows `adb root`) plus a tiny adb harness in `scripts/android-test/at.sh`:

```bash
export PATH=/opt/homebrew/share/android-commandlinetools/platform-tools:$PATH
scripts/android-test/at.sh boot                 # headless emulator, waits for boot
./android/gradlew -p android app:installDebug -x lint -x test -PreactNativeArchitectures=arm64-v8a
npx expo start --port 8081 &                    # Metro (JS hot reload); then: adb reverse tcp:8081 tcp:8081
scripts/android-test/at.sh seed-feeds scripts/android-test/feeds.json   # test feed list into AsyncStorage
scripts/android-test/at.sh launch | kill | bg   # open / process death / background
scripts/android-test/at.sh state                # generations, pointers, jobs, cached HTML count
scripts/android-test/at.sh stale 2              # pretend the last feed pass was 2h ago
scripts/android-test/at.sh shot | ui | tap X Y  # screenshot / visible texts+bounds / tap
```

- Kotlin changes need `installDebug`; JS changes reload through Metro.
- The yellow dev "Open debugger to view warnings" banner can cover the update toast: dismiss it (tap its ✕) first.
