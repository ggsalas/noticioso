import { getDatabase, resetDatabaseForTesting } from "./database";
import { runMigrations } from "./migrate";
import { migrateFromAsyncStorage } from "./migrateFromAsyncStorage";
import { feedCacheRepository } from "./FeedCacheRepository";
import { articleCacheRepository } from "./ArticleCacheRepository";
import { lastRefreshRepository } from "./LastRefreshRepository";
import { dataMigrationRepository } from "./DataMigrationRepository";

// Track initialization state
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;

/**
 * Initialize the database, run schema migrations, and migrate data from AsyncStorage.
 * This function is idempotent and safe to call multiple times.
 * It ensures the database is ready before FeedsProvider reads caches.
 */
export async function initializeDatabase(): Promise<void> {
  // If already initialized, return immediately
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      // Open database and run schema migrations
      await getDatabase();
      await runMigrations();

      // Migrate data from AsyncStorage to SQLite
      await migrateFromAsyncStorage(
        feedCacheRepository,
        articleCacheRepository,
        lastRefreshRepository,
        dataMigrationRepository
      );

      isInitialized = true;
    } catch (error) {
      // Reset state so we can retry
      initializationPromise = null;
      console.error("Failed to initialize database:", error);
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Check if the database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized;
}

/**
 * Reset database state for testing purposes
 */
export function resetDatabaseForTestingOnly(): void {
  initializationPromise = null;
  isInitialized = false;
  resetDatabaseForTesting();
}
