import { getDatabase, resetDatabaseForTesting, setDatabaseFactoryForTesting } from "@/db/database";
import { RealSqliteTestDatabase } from "@/db/testing/RealSqliteTestDatabase";
import { ensureSchema, SCHEMA_VERSION } from "@/db/ensureSchema";

const TABLES = [
  "active_refresh",
  "article_download_jobs",
  "article_metadata",
  "feed_snapshots",
  "last_fetch_completion",
  "pending_refresh",
  "refresh_feeds",
  "refreshes",
];

async function tableNames(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

async function userVersion(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

async function insertRefresh(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO refreshes (id, state, created_at) VALUES (?, 'applied', '2026-01-01T00:00:00Z')",
    [id],
  );
}

describe("ensureSchema", () => {
  beforeEach(async () => {
    await resetDatabaseForTesting();
    setDatabaseFactoryForTesting(async () => new RealSqliteTestDatabase().asExpoDatabase());
  });

  afterAll(async () => {
    await resetDatabaseForTesting();
    setDatabaseFactoryForTesting(null);
  });

  it("creates every table on a new database and stores the schema version", async () => {
    await ensureSchema();

    expect(await tableNames()).toEqual(TABLES);
    expect(await userVersion()).toBe(SCHEMA_VERSION);
  });

  it("uses (refresh_id, url) as the primary key of article_download_jobs", async () => {
    await ensureSchema();
    const db = await getDatabase();

    const columns = await db.getAllAsync<{ name: string; pk: number }>(
      "PRAGMA table_info(article_download_jobs)",
    );

    expect(columns.find((c) => c.name === "refresh_id")?.pk).toBe(1);
    expect(columns.find((c) => c.name === "url")?.pk).toBe(2);
  });

  it("has the position column in refresh_feeds (feed order)", async () => {
    await ensureSchema();
    const db = await getDatabase();

    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(refresh_feeds)");

    expect(columns.map((c) => c.name)).toContain("position");
  });

  it("keeps the data when the version matches (runs on every start)", async () => {
    await ensureSchema();
    await insertRefresh("r1");

    await ensureSchema();

    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM refreshes");
    expect(row?.count).toBe(1);
  });

  it("drops and recreates a database with another version (no migrations)", async () => {
    const db = await getDatabase();
    // An old development database: different tables, no version stored
    await db.execAsync(`
      CREATE TABLE feed_cache (url TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE article_download_jobs (url TEXT PRIMARY KEY, refresh_id TEXT NOT NULL);
      INSERT INTO feed_cache VALUES ('https://example.com/feed', '{}');
    `);

    await ensureSchema();

    expect(await tableNames()).toEqual(TABLES);
    expect(await userVersion()).toBe(SCHEMA_VERSION);
    const columns = await db.getAllAsync<{ name: string; pk: number }>(
      "PRAGMA table_info(article_download_jobs)",
    );
    expect(columns.find((c) => c.name === "refresh_id")?.pk).toBe(1);
  });

  it("drops the data of a database with a newer or older stored version", async () => {
    await ensureSchema();
    await insertRefresh("r1");
    const db = await getDatabase();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    await ensureSchema();

    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM refreshes");
    expect(row?.count).toBe(0);
    expect(await userVersion()).toBe(SCHEMA_VERSION);
  });

  it("enforces the job status values", async () => {
    await ensureSchema();
    const db = await getDatabase();

    await expect(
      db.runAsync(
        `INSERT INTO article_download_jobs (refresh_id, url, feed_url, status, created_at)
         VALUES ('r1', 'https://example.com/a', 'https://example.com/feed', 'bogus', '2026-01-01T00:00:00Z')`,
      ),
    ).rejects.toThrow();
  });
});
