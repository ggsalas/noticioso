# Noticioso Android - Agent Guidelines

## Git

- NEVER run git commands that modify state (no git add, git commit, git push, git rebase, git reset, git merge, nothing that changes history or index)
- Read-only git commands are allowed (git log, git diff, git show, git status, git branch)
- NEVER create commits or interact with git in any way that modifies the repo
- The user manages git exclusively

## Build/Test/Lint Commands

- `npm run lint` - Run Expo linter
- `npm test` - Run Jest tests in watch mode (single test: `npm test -- --testNamePattern="test name"`)
- `npm start` - Start Expo dev server
- `npm run android` - Start on Android device
- `npm run ios` - Start on iOS device

## Project Structure

- React Native Expo app with TypeScript
- Expo Router for navigation (`app/` directory)
- Path aliases: `@/*` and `~/*` point to project root
- Components in `components/`, services in `services/`, providers in `providers/`

## Service Layer Architecture

Services encapsulate all business logic and data access. Each service is a class with a singleton export:

```
services/
  StorageService.ts          -- AsyncStorage abstraction
  FeedService.ts             -- The user's feed list (CRUD, import/export) in AsyncStorage
  FeedContentService.ts      -- Reads feed content of the active generation (+ article metadata)
  FeedRefreshService.ts      -- Triggers native refresh, applies a pending generation, 1h staleness
  ArticleService.ts          -- Article HTML for reading (cache first, on-demand fetch)
  ArticleCacheService.ts     -- Article HTML files + metadata
  FeedDiscoveryService.ts    -- Find RSS feeds from websites (used when adding a feed)
```

- Feed fetching/parsing and article pre-download are done by the native module (`modules/FeedRefreshModule`), not by JS services

- Dependencies are injected via constructor WITHOUT default values
- The singleton export passes all required dependencies explicitly (e.g. `export const feedContentService = new FeedContentService(articleCacheService)`)
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
