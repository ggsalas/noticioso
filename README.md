<div align="center">
  <img src="assets/images/splash-icon-light.png" width="160" alt="Noticioso" />

  <h1>Noticioso</h1>

  <p>A personal RSS feed reader built for e-ink Android devices.<br/>No algorithm, no ads, no noise, just the articles you chose to follow. </p>

  <a href="https://github.com/ggsalas/noticioso-native/releases/latest/download/noticioso.apk">
    <img src="https://img.shields.io/badge/Download-APK-4CAF50?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" />
  </a>
</div>

## Features

- **Feed discovery** — paste a URL or type a search term. The app queries DuckDuckGo, visits each result, and auto-discovers RSS/Atom feeds.
- **Full article extraction** — fetches the original article and runs it through Mozilla Readability for a distraction-free reading experience.
- **Paginated reader** — all content (feed list, article list, article body) renders inside a WebView using CSS multi-column layout. Swipe left/right to flip pages, swipe up/down to navigate between screens.
- **Drag-to-reorder feeds** — manage your feed list with drag-and-drop.
- **Import / Export** — back up and restore your feed list as a JSON file via the native share sheet and document picker.

## Tech Stack

| Category           | Libraries                                                  |
| ------------------ | ---------------------------------------------------------- |
| Framework          | React Native, Expo                                         |
| Navigation         | Expo Router (file-based routing)                           |
| RSS Parsing        | `fast-xml-parser`                                          |
| Article Extraction | `@mozilla/readability` + `linkedom`                        |
| HTML Rendering     | `react-native-webview` (custom paginated wrapper)          |
| Gestures           | `react-native-gesture-handler`, `react-native-reanimated`  |
| Storage            | `@react-native-async-storage/async-storage`                |
| File I/O           | `expo-file-system`, `expo-document-picker`, `expo-sharing` |

## Development

```bash
npm install

# Start Expo dev server
npm start

# Run on a connected Android device
npm run android

# Run on iOS simulator
npm run ios

# Lint
npm run lint

# Tests
npm test
```

For a native dev build without Expo Go (required to debug native behaviour):

```bash
npx expo install expo-dev-client
npx expo run:android
```

## Architecture

The app is split into three distinct layers: a service layer that owns all business logic, a UI layer that stays intentionally thin, and a framework-agnostic library for the paginated reader engine.

### services/

Plain TypeScript classes with no dependency on React or the component lifecycle. Each service exports a singleton instance used throughout the app, but accepts its dependencies via constructor, making them instantiable and testable in isolation.

- `StorageService.ts` — typed key-value interface over AsyncStorage
- `FeedService.ts` — fetches and parses RSS feeds, manages feed persistence
- `ArticleService.ts` — fetches articles and extracts clean content via Readability
- `FeedDiscoveryService.ts` — discovers RSS feeds from URLs or plain search terms via DuckDuckGo

### UI Layer

Screens and components read from context providers and call service methods directly. State lives in `FeedsProvider`. The theme system exposes a single `baseFontSize` from which all typography, spacing, and layout values are derived.

### lib/

Self-contained modules with no framework dependencies. Portable, independently testable, and free of React Native or Expo concerns.

#### lib/horizontalNavigation

The core of the paginated reader. Generates the HTML document injected into the WebView, including the CSS multi-column layout, theme tokens as CSS variables, and a bridge script that communicates page dimensions and user interactions back to React Native via `postMessage`.
