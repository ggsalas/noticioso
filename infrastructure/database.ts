import * as SQLite from "expo-sqlite";

// Stable, explicit DB filename - app-private, future Kotlin modules can open same file
export const DATABASE_NAME = "noticioso.db";

// Singleton database instance
let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbInstance;
}

// For testing - reset the singleton
export function resetDatabaseForTesting(): void {
  dbInstance = null;
}
