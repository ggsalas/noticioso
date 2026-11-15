import type { SQLiteDatabase } from "expo-sqlite";

// Stable, explicit DB filename shared by expo-sqlite (JS) and the Kotlin module.
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
