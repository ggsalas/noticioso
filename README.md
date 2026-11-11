<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/images/splash-icon-dark.png" />
    <img src="assets/images/splash-icon-light.png" width="160" alt="Noticioso" />
  </picture>

  <h1>Noticioso</h1>

  <p>A personal RSS reader with full article extraction, built for e-ink devices.<br/>No algorithm, no noise, just the articles you chose to follow. </p>

  <a href="https://github.com/ggsalas/noticioso-native/releases/latest/download/noticioso.apk">
    <img src="https://img.shields.io/badge/Download-APK-4CAF50?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" />
  </a>
</div>

## Features

- **Feed discovery** — paste a URL or type a search term. The app queries DuckDuckGo, visits each result, and auto-discovers RSS/Atom feeds.
- **Full article extraction** — fetches the original article and runs it through Mozilla Readability for a distraction-free reading experience.
- **Paginated reader** — all content (feed list, article list, article body) renders inside a WebView using CSS multi-column layout. Swipe left/right to flip pages, swipe up/down to navigate between screens.
- **Share to read** — share any URL from your browser directly into Noticioso to read it as a clean, distraction-free article.
- **Import / Export** — back up and restore your feed list as a JSON file via the native share sheet and document picker.

## Tech Stack

| Category           | Libraries                                                 |
| ------------------ | --------------------------------------------------------- |
| Framework          | React Native, Expo                                        |
| Data pipeline      | Native Expo module in Kotlin (`modules/FeedRefreshModule`) |
| Article Extraction | `@mozilla/readability` + `linkedom`                       |
| HTML Rendering     | `react-native-webview` (custom paginated wrapper)         |
| Gestures           | `react-native-gesture-handler`, `react-native-reanimated` |
| Storage            | `expo-sqlite` (feeds and articles), `@react-native-async-storage/async-storage` (feed list) |

## Development

```bash
npm install

# Start Expo dev server
npm start

# Run on a connected Android device
npm run android

# Build, install and run on the local emulator (AVD noticioso-test), with hot reload
npm run android:emulator

# Run on iOS simulator
npm run ios

# Lint
npm run lint

# Tests (requires Node 22.5+ for the built-in real SQLite test engine)
npm test
```

Database migration/repository tests use Node's `node:sqlite` against a real
in-memory SQLite database; the production app still uses `expo-sqlite`. There is no
hand-written SQL mock in the Jest setup.

For a native dev build without Expo Go (required to debug native behaviour):

```bash
npx expo install expo-dev-client
npx expo run:android
```

### Android native build prerequisites

`npm start` only boots Metro — the JavaScript bundler and dev server. It never touches the Android toolchain. `npm run android` (and `npx expo run:android`) additionally compiles the native project, installs the APK on the device, and therefore needs an Android SDK and a compatible JDK.

Use **JDK 17**, not the newest JDK you can install. Gradle and the Android tooling used by this project reject a newer runtime — running a build on Java 27 fails with `Unsupported class file major version 71`.

On macOS with Homebrew:

```bash
# Install Eclipse Temurin JDK 17
brew install --cask temurin@17

# Point the build at it for this shell
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Confirm the active runtime reports 17.x
java -version
```

Install the Android SDK **outside** the repository and point the build at it with `ANDROID_HOME`. On this machine the SDK lives at `/opt/homebrew/share/android-commandlinetools` (your location will differ):

```bash
# Example - use your own SDK location
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

`.gitignore` also carries root-anchored patterns (`/.sdk/`, `/build-tools/`, `/licenses/`, `/platform-tools/`, `/platforms/`). They are not where the SDK is supposed to live — they only prevent accidental commits if SDK artifacts ever end up placed inside the repo. The generated root `android/` and `ios/` projects are ignored the same way, along with Gradle build outputs under local modules (`/modules/*/android/build/`). Hand-written native module sources stay tracked: `modules/*/android/build.gradle` and `modules/*/android/src/**` (including the Kotlin sources) are committed with the app.

## Architecture

Noticioso is **one app with one boundary**. A native module written in Kotlin
handles the data; the JavaScript side handles the user.

```
 JavaScript (React Native)                   Native module (Kotlin)
 ─────────────────────────                   ──────────────────────
 Screens and reader            ── asks ──▶   Fetches and parses feeds
 Decides WHEN to refresh                     Downloads articles
 Reads what is stored          ◀─ events ──  Applies new content
 The user's feed list                        Cleans up old content
                    \                        /
                     SQLite database + article files
                     (only the native module writes)
```

### Native module — the data (`modules/FeedRefreshModule`)

Everything that fetches from the internet or changes stored data:

- Fetches and parses every feed into a new **generation** of content.
- Downloads each article (HTML, image, author, excerpt) so it can be read offline.
- Applies a new generation when the user accepts it, and deletes what is no longer used.
- Runs one task at a time and reports progress to the JavaScript side.

It is the **only writer** of the database and the article files.

### JavaScript — the user (everything else)

- **Decides when**: refreshes on app open, on return to the app (if the content
  is more than an hour old) or on demand, and offers new content with a toast.
  The user keeps seeing the current content until they accept the new one.
- **Reads and shows**: the feed list, articles, and download progress, straight
  from the database and article files.
- **Owns the user's configuration**: the list of feeds (add, remove, import,
  export) and finding a site's feed when adding one.
- **Renders**: screens, navigation and the paginated reader, which runs inside a
  WebView (`lib/webview/`).
- **Defines the database structure** (schema and migrations), but does not write
  content into it.

Rule of thumb: if the native module already does something, JavaScript does not
reimplement it — it asks the native module.

The few things both sides must agree on (database location, article file names,
stored feed format) are pinned by shared test fixtures, so changing only one
side fails a test.

More detail: [`docs/architecture.md`](docs/architecture.md).
