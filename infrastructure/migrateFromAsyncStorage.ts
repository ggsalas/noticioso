import AsyncStorage from "@react-native-async-storage/async-storage";
import { FeedCacheRepository } from "./FeedCacheRepository";
import { ArticleCacheRepository } from "./ArticleCacheRepository";
import { LastRefreshRepository } from "./LastRefreshRepository";
import { DataMigrationRepository } from "./DataMigrationRepository";

const FEED_CACHE_PREFIX = "@noticioso-feedCache-";
const ARTICLE_HTML_CACHE_PREFIX = "@noticioso-articleHtmlCache-";
const ARTICLE_INDEX_KEY = "@noticioso-articleHtmlCache-index";
const LAST_FULL_REFRESH_KEY = "@noticioso-lastFullRefresh";

/**
 * Durable marker name stored in the data_migrations table once the
 * AsyncStorage -> SQLite import has fully completed.
 * Note: intentionally NOT removed by StorageService.clearCaches so an
 * intentional cache clear does not repopulate caches from legacy backups.
 */
export const MIGRATION_MARKER = "asyncstorage_cache_v1";

/**
 * Migrates cached data from AsyncStorage to SQLite.
 * Idempotent - safe to run multiple times.
 * Preserves original AsyncStorage keys as backup.
 * Only runs once: writes a durable marker (data_migrations table) after all
 * steps complete successfully. The marker is NOT cleared by cache clears, so
 * an intentional cache clear does not repopulate caches from legacy backups.
 * If interrupted or a repository/db write fails (marker not written),
 * rerunning safely resumes because already-imported rows are skipped.
 */
export async function migrateFromAsyncStorage(
  feedCacheRepo: FeedCacheRepository,
  articleCacheRepo: ArticleCacheRepository,
  lastRefreshRepo: LastRefreshRepository,
  dataMigrationRepo: DataMigrationRepository
): Promise<void> {
  // Check if migration already completed
  const isCompleted = await dataMigrationRepo.isCompleted(MIGRATION_MARKER);
  if (isCompleted) {
    return;
  }

  // Migrate feed caches
  await migrateFeedCaches(feedCacheRepo);

  // Migrate article metadata
  await migrateArticleMetadata(articleCacheRepo);

  // Migrate last full refresh timestamp
  await migrateLastFullRefresh(lastRefreshRepo);

  // Mark migration as complete only after all steps succeed
  await dataMigrationRepo.markCompleted(MIGRATION_MARKER);
}

async function migrateFeedCaches(repo: FeedCacheRepository): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const feedCacheKeys = allKeys.filter((key) => key.startsWith(FEED_CACHE_PREFIX));

  for (const key of feedCacheKeys) {
    const url = key.substring(FEED_CACHE_PREFIX.length);
    
    // Skip if already in SQLite
    const existing = await repo.get(url);
    if (existing) continue;

    // Reading or parsing a single malformed legacy entry is non-fatal:
    // log, skip that entry, and continue (startup is preserved).
    let feedCache: { data: any; cachedAt: string };
    try {
      const feedCacheJson = await AsyncStorage.getItem(key);
      if (!feedCacheJson) continue;
      feedCache = JSON.parse(feedCacheJson) as { data: any; cachedAt: string };
    } catch (error) {
      console.warn(`Failed to migrate feed cache for ${url}:`, error);
      continue;
    }

    if (feedCache.data && feedCache.cachedAt) {
      // A real repository/db write failure must propagate so the completion
      // marker is NOT written. Reruns resume because existing rows are skipped.
      await repo.set(url, feedCache.data, feedCache.cachedAt);
    }
  }
}

async function migrateArticleMetadata(repo: ArticleCacheRepository): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const articleKeys = allKeys.filter(
    (key) => key.startsWith(ARTICLE_HTML_CACHE_PREFIX) && key !== ARTICLE_INDEX_KEY
  );

  // Load index for LRU timestamps. Malformed index JSON is non-fatal:
  // log and proceed with index = null (per-entry timestamps fall back to
  // the metadata's own fetchedAt/lastAccessedAt).
  let index: Record<string, { cachedAt: string; lastAccessedAt: string }> | null = null;
  try {
    const indexJson = await AsyncStorage.getItem(ARTICLE_INDEX_KEY);
    if (indexJson) {
      index = JSON.parse(indexJson) as Record<string, { cachedAt: string; lastAccessedAt: string }>;
    }
  } catch (error) {
    console.warn("Failed to parse article index during migration; continuing without LRU timestamps:", error);
    index = null;
  }

  for (const key of articleKeys) {
    const url = key.substring(ARTICLE_HTML_CACHE_PREFIX.length);
    
    // Skip if already in SQLite
    const existing = await repo.getMetadata(url);
    if (existing) continue;

    // Reading or parsing a single malformed legacy entry is non-fatal:
    // log, skip that entry, and continue (startup is preserved).
    let metadata: any;
    try {
      const metadataJson = await AsyncStorage.getItem(key);
      if (!metadataJson) continue;
      metadata = JSON.parse(metadataJson) as any;
    } catch (error) {
      console.warn(`Failed to migrate article metadata for ${url}:`, error);
      continue;
    }

    // Use index timestamps if available, otherwise fall back to metadata timestamps
    const indexEntry = index?.[url];
    const fetchedAt = indexEntry?.cachedAt || metadata.fetchedAt || new Date().toISOString();
    const lastAccessedAt = indexEntry?.lastAccessedAt || metadata.lastAccessedAt || fetchedAt;

    // A real repository/db write failure must propagate so the completion
    // marker is NOT written. Reruns resume because existing rows are skipped.
    await repo.setMetadata(url, {
      heroImage: metadata.heroImage,
      byline: metadata.byline || "",
      title: metadata.title || "",
      excerpt: metadata.excerpt || "",
      fetchedAt,
      lastAccessedAt,
    });
  }
}

async function migrateLastFullRefresh(repo: LastRefreshRepository): Promise<void> {
  // Skip if already in SQLite
  const existing = await repo.get();
  if (existing) return;

  const timestamp = await AsyncStorage.getItem(LAST_FULL_REFRESH_KEY);
  if (timestamp) {
    // A real repository/db write failure must propagate so the completion
    // marker is NOT written and a later run can retry.
    await repo.set(timestamp);
  }
}
