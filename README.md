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
| RSS Parsing        | `fast-xml-parser`                                         |
| Article Extraction | `@mozilla/readability` + `linkedom`                       |
| HTML Rendering     | `react-native-webview` (custom paginated wrapper)         |
| Gestures           | `react-native-gesture-handler`, `react-native-reanimated` |
| Storage            | `@react-native-async-storage/async-storage`               |

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

The service layer is a set of plain TypeScript classes with no dependency on React or the component lifecycle. Dependencies are injected via constructor, so each service can be instantiated and tested in isolation. Together they cover feed discovery via DuckDuckGo, RSS fetching and parsing, article extraction through Mozilla Readability, and persistent storage over AsyncStorage.

### UI Layer

Screens and components read from context providers and call service methods directly. State lives in `FeedsProvider`. The theme system exposes a single `baseFontSize` from which all typography, spacing, and layout values are derived.

### lib/

Self-contained modules with no framework dependencies.

#### lib/horizontalNavigation

The core of the paginated reader. Generates the HTML document injected into the WebView, including the CSS multi-column layout, theme tokens as CSS variables, and a bridge script that communicates page dimensions and user interactions back to React Native via `postMessage`.
