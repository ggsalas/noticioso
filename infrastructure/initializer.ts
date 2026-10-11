import { getDatabase, resetDatabaseForTesting } from "./database";
import { runMigrations } from "./migrate";
import { legacyCacheCleanup } from "./legacy/LegacyCacheCleanup";

// Track initialization state
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;

/**
 * Initialize the database with Stage 2 clean baseline.
 *
 * Startup ordering:
 * 1. Run one-time legacy cleanup (preserves feedList, removes old caches)
 * 2. Run schema migrations (detects and drops Stage 1 tables if present)
 * 3. Database is ready for use
 *
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
      // Step 1: Run one-time legacy cleanup
      // This preserves @noticioso-feedList and removes old AsyncStorage caches
      // Safe to call multiple times (idempotent)
      await legacyCacheCleanup.run();

      // Step 2: Open database and run schema migrations
      // If Stage 1 tables exist, they will be dropped and clean baseline created
      await getDatabase();
      await runMigrations();

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
