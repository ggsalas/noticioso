import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths, File, Directory } from "expo-file-system";

/**
 * LegacyCacheCleanup handles one-time destructive cleanup of Stage 1 data.
 * 
 * Stage 1 was never in production. This cleanup:
 * - Preserves @noticioso-feedList (user data)
 * - Removes all legacy AsyncStorage cache keys
 * - Removes old HTML article cache files
 * - Marks completion so it never runs again
 * 
 * This runs BEFORE the new schema is initialized, so any old database
 * will be detected and reset by the migration layer.
 */

const LEGACY_CLEANUP_MARKER = "@noticioso-legacyCleanupCompleted";

const LEGACY_KEYS_TO_REMOVE = [
  "@noticioso-feedCache",
  "@noticioso-feedCacheIndex",
  "@noticioso-lastFullRefresh",
  "@noticioso-articleHtmlCache",
  "@noticioso-articleHtmlCacheIndex",
  "@noticioso-articleMetadataCache",
  "@noticioso-article-ranking",
];

const LEGACY_KEY_PREFIXES_TO_REMOVE = [
  "@noticioso-feedCache-",
  "@noticioso-articleHtmlCache-",
];

export class LegacyCacheCleanup {
  /**
   * Run the legacy cleanup if not already completed.
   * This is idempotent and retryable.
   */
  async run(): Promise<void> {
    // Check if cleanup already completed
    const marker = await AsyncStorage.getItem(LEGACY_CLEANUP_MARKER);
    if (marker === "true") {
      return; // Already cleaned up
    }

    try {
      // 1. Preserve feed list (do nothing - it's not in the removal list)
      
      // 2. Remove legacy AsyncStorage keys
      await this.removeLegacyKeys();
      
      // 3. Remove old HTML cache files
      await this.removeHtmlCacheFiles();
      
      // 4. Mark cleanup as completed
      await AsyncStorage.setItem(LEGACY_CLEANUP_MARKER, "true");
    } catch (error) {
      // If cleanup fails, don't mark as completed so it can retry
      console.error("Legacy cleanup failed, will retry:", error);
      throw error;
    }
  }

  /**
   * Remove all legacy AsyncStorage keys
   */
  private async removeLegacyKeys(): Promise<void> {
    // Get all keys
    const allKeys = await AsyncStorage.getAllKeys();
    
    // Filter to keys we want to remove
    const keysToRemove = allKeys.filter((key) => {
      // Exact matches
      if (LEGACY_KEYS_TO_REMOVE.includes(key)) {
        return true;
      }
      
      // Prefix matches
      return LEGACY_KEY_PREFIXES_TO_REMOVE.some((prefix) => key.startsWith(prefix));
    });
    
    // Remove all matching keys
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  }

  /**
   * Remove old HTML article cache files from filesystem
   */
  private async removeHtmlCacheFiles(): Promise<void> {
    try {
      const htmlCacheDir = new Directory(Paths.cache, "article-html");
      
      // Check if directory exists
      if (!htmlCacheDir.exists) {
        return;
      }
      
      // Get all files in directory
      const files = htmlCacheDir.list();
      
      // Delete each file
      for (const file of files) {
        file.delete();
      }
    } catch (error) {
      // Log but don't fail - HTML cache cleanup is non-critical
      console.warn("Failed to remove HTML cache files:", error);
    }
  }

  /**
   * Check if legacy cleanup has been completed
   */
  async isCompleted(): Promise<boolean> {
    const marker = await AsyncStorage.getItem(LEGACY_CLEANUP_MARKER);
    return marker === "true";
  }

  /**
   * Reset the cleanup marker (for testing only)
   */
  async resetForTesting(): Promise<void> {
    await AsyncStorage.removeItem(LEGACY_CLEANUP_MARKER);
  }
}

export const legacyCacheCleanup = new LegacyCacheCleanup();
