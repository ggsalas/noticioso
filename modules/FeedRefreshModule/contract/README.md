# JS ↔ native contracts

JS and the Kotlin module share one SQLite database and one article cache folder.
These files pin what both sides must agree on. Each file is read by a Jest test
(`modules/FeedRefreshModule/src/__tests__/contract.test.ts`) **and** a Kotlin test
(`android/src/test/java/ContractTest.kt`), so changing one side alone fails a test
instead of silently breaking the app.

| File | What it pins | JS side | Kotlin side |
| --- | --- | --- | --- |
| `database.json` | Database folder + file name | `infrastructure/database.ts` (`DATABASE_NAME`; expo-sqlite uses `SQLite/`) | `db/NoticiosoDatabase.kt` |
| `article-file-names.json` | Article cache folder and URL → file name | `services/ArticleCacheService.ts` (`articleFileName`) | `articles/ArticleFiles.kt` |
| `feed-snapshot.json` | JSON stored in `feed_snapshots.data` | read as `FeedData` (`FeedContentService`) | written by `feeds/FeedJson.kt` |
