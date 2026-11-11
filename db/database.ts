import type { SQLiteDatabase } from "expo-sqlite";

// CONTRACT with native (db/NoticiosoDatabase.kt), pinned by
// modules/FeedRefreshModule/contract/database.json: both runtimes open this file.
export const DATABASE_NAME = "noticioso.db";

export type DatabaseFactory = () => Promise<SQLiteDatabase>;

// One shared connection. Caching the PROMISE (not the instance) makes concurrent
// first calls share a single open instead of each opening their own connection.
let dbPromise: Promise<SQLiteDatabase> | null = null;
let databaseFactoryForTesting: DatabaseFactory | null = null;

// The native module writes to this database from its own connection (feed pass,
// article downloads, garbage collection). Without a busy timeout a JS read that
// collides with a native write fails immediately with "database is locked";
// with it, SQLite waits for the writer to finish.
const BUSY_TIMEOUT_MS = 5000;

async function openDatabase(): Promise<SQLiteDatabase> {
  if (databaseFactoryForTesting) {
    return databaseFactoryForTesting();
  }
  // Load the native Expo module only in the app runtime. Jest injects a real
  // SQLite test connection through setDatabaseFactoryForTesting().
  const SQLite = await import("expo-sqlite");
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
}

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null; // allow a retry after a failed open
      throw error;
    });
  }
  return dbPromise;
}

/** Test-only injection point for a real SQLite connection (for example node:sqlite). */
export function setDatabaseFactoryForTesting(factory: DatabaseFactory | null): void {
  databaseFactoryForTesting = factory;
}

/** Close and reset the current connection between database integration tests. */
export async function resetDatabaseForTesting(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    dbPromise = null;
    await db.closeAsync();
  }
}
