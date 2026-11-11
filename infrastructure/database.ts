import type { SQLiteDatabase } from "expo-sqlite";

// CONTRACT with native (db/NoticiosoDatabase.kt), pinned by
// modules/FeedRefreshModule/contract/database.json: both runtimes open this file.
export const DATABASE_NAME = "noticioso.db";

export type DatabaseFactory = () => Promise<SQLiteDatabase>;

let dbInstance: SQLiteDatabase | null = null;
let databaseFactoryForTesting: DatabaseFactory | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbInstance) {
    if (databaseFactoryForTesting) {
      dbInstance = await databaseFactoryForTesting();
    } else {
      // Load the native Expo module only in the app runtime. Jest injects a real
      // SQLite test connection through setDatabaseFactoryForTesting().
      const SQLite = await import("expo-sqlite");
      dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
    }
  }
  return dbInstance;
}

/** Test-only injection point for a real SQLite connection (for example node:sqlite). */
export function setDatabaseFactoryForTesting(factory: DatabaseFactory | null): void {
  databaseFactoryForTesting = factory;
}

/** Close and reset the current connection between database integration tests. */
export async function resetDatabaseForTesting(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}
