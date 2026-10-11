import { getDatabase, resetDatabaseForTesting, setDatabaseFactoryForTesting } from "@/infrastructure/database";
import { RealSqliteTestDatabase } from "@/infrastructure/testing/RealSqliteTestDatabase";
import { runMigrations, SCHEMA_VERSION } from "@/infrastructure/migrate";
import { CREATE_TABLES_SQL_V1 } from "@/infrastructure/schema";

describe("Schema Migration v3", () => {
  beforeEach(async () => {
    await resetDatabaseForTesting();
    setDatabaseFactoryForTesting(async () => new RealSqliteTestDatabase().asExpoDatabase());
  });

  afterAll(async () => {
    await resetDatabaseForTesting();
    setDatabaseFactoryForTesting(null);
  });
  describe("article_download_jobs table", () => {
    it("should exist after migration", async () => {
      await runMigrations();
      const db = await getDatabase();

      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM sqlite_master
         WHERE type='table' AND name='article_download_jobs'`
      );

      expect(result?.count).toBe(1);
    });

    it("should have correct schema with all required columns", async () => {
      await runMigrations();
      const db = await getDatabase();

      const tableInfo = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
        `PRAGMA table_info(article_download_jobs)`
      );

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain("url");
      expect(columnNames).toContain("refresh_id");
      expect(columnNames).toContain("feed_url");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("file_path");
      expect(columnNames).toContain("error_message");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("completed_at");
    });

    it("should use (refresh_id, url) as compound primary key", async () => {
      await runMigrations();
      const db = await getDatabase();

      const tableInfo = await db.getAllAsync<{ name: string; pk: number }>(
        `PRAGMA table_info(article_download_jobs)`
      );

      const urlColumn = tableInfo.find((col) => col.name === "url");
      const refreshIdColumn = tableInfo.find((col) => col.name === "refresh_id");
      expect(refreshIdColumn?.pk).toBe(1);
      expect(urlColumn?.pk).toBe(2);
    });

    it("should enforce status constraint", async () => {
      await runMigrations();
      const db = await getDatabase();

      // Valid status should work
      await expect(
        db.runAsync(
          `INSERT INTO article_download_jobs 
           (url, refresh_id, feed_url, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            "https://example.com/article1",
            "refresh-1",
            "https://feed1.com/rss",
            "pending",
            "2026-10-06T12:00:00.000Z",
          ]
        )
      ).resolves.not.toThrow();

      // Invalid status should fail
      await expect(
        db.runAsync(
          `INSERT INTO article_download_jobs 
           (url, refresh_id, feed_url, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            "https://example.com/article2",
            "refresh-1",
            "https://feed1.com/rss",
            "invalid_status",
            "2026-10-06T12:00:00.000Z",
          ]
        )
      ).rejects.toThrow();
    });

    it("should allow null file_path and error_message", async () => {
      await runMigrations();
      const db = await getDatabase();

      await expect(
        db.runAsync(
          `INSERT INTO article_download_jobs 
           (url, refresh_id, feed_url, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            "https://example.com/article1",
            "refresh-1",
            "https://feed1.com/rss",
            "pending",
            "2026-10-06T12:00:00.000Z",
          ]
        )
      ).resolves.not.toThrow();

      const row = await db.getFirstAsync<{
        file_path: string | null;
        error_message: string | null;
      }>(`SELECT file_path, error_message FROM article_download_jobs WHERE url = ?`, [
        "https://example.com/article1",
      ]);

      expect(row?.file_path).toBeNull();
      expect(row?.error_message).toBeNull();
    });

    it("should have indexes on refresh_id and status", async () => {
      await runMigrations();
      const db = await getDatabase();

      const indexes = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='article_download_jobs'`
      );

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain("idx_article_download_jobs_refresh_id");
      expect(indexNames).toContain("idx_article_download_jobs_status");
    });

    it("should be idempotent - running migration twice should not fail", async () => {
      await runMigrations();
      await expect(runMigrations()).resolves.not.toThrow();

      const db = await getDatabase();
      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM sqlite_master
         WHERE type='table' AND name='article_download_jobs'`
      );

      expect(result?.count).toBe(1);
    });
  });

  describe("data preservation across migrations", () => {
    it("should preserve existing data when re-running migrations", async () => {
      await runMigrations();
      const db = await getDatabase();

      // Insert some existing data
      await db.runAsync(
        `INSERT INTO refreshes (id, state, created_at)
         VALUES (?, ?, ?)`,
        ["refresh-1", "building", "2026-10-06T12:00:00.000Z"]
      );

      await db.runAsync(
        `INSERT INTO article_metadata (url, hero_image, byline, title, excerpt, fetched_at, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "https://example.com/article1",
          "https://example.com/image.jpg",
          "John Doe",
          "Test Article",
          "Test excerpt",
          "2026-10-06T12:00:00.000Z",
          "2026-10-06T12:00:00.000Z",
        ]
      );

      // Run migration again (simulating upgrade)
      await runMigrations();

      // Verify existing data is preserved
      const refresh = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM refreshes WHERE id = ?`,
        ["refresh-1"]
      );
      expect(refresh?.id).toBe("refresh-1");

      const article = await db.getFirstAsync<{ url: string }>(
        `SELECT url FROM article_metadata WHERE url = ?`,
        ["https://example.com/article1"]
      );
      expect(article?.url).toBe("https://example.com/article1");

      // Verify new table exists
      const jobs = await db.getAllAsync(`SELECT * FROM article_download_jobs`);
      expect(jobs).toBeDefined();
    });

    it("rebuilds the v2 URL-only jobs table as a compound key and preserves rows", async () => {
      const db = await getDatabase();
      await db.execAsync(CREATE_TABLES_SQL_V1);
      await db.execAsync(`
        CREATE TABLE article_download_jobs (
          url TEXT PRIMARY KEY,
          refresh_id TEXT NOT NULL,
          feed_url TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'downloading', 'completed', 'failed')),
          file_path TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT
        )
      `);
      await db.runAsync(
        `INSERT INTO article_download_jobs (url, refresh_id, feed_url, status, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        ["https://example.com/a", "refresh-a", "https://feed.test", "completed", "2026-10-06T12:00:00.000Z"]
      );

      await runMigrations();

      const tableInfo = await db.getAllAsync<{ name: string; pk: number }>(`PRAGMA table_info(article_download_jobs)`);
      expect(tableInfo.find((column) => column.name === "refresh_id")?.pk).toBe(1);
      expect(tableInfo.find((column) => column.name === "url")?.pk).toBe(2);
      const row = await db.getFirstAsync<{ refresh_id: string; url: string; status: string }>(
        `SELECT refresh_id, url, status FROM article_download_jobs WHERE refresh_id = ? AND url = ?`,
        ["refresh-a", "https://example.com/a"]
      );
      expect(row).toEqual({ refresh_id: "refresh-a", url: "https://example.com/a", status: "completed" });
    });

    it("should backfill refresh_feeds.position preserving insertion order when upgrading from v2", async () => {
      const db = await getDatabase();

      // Set up v2 state: create baseline schema (without position column) and insert a refresh
      await db.execAsync(CREATE_TABLES_SQL_V1);

      await db.runAsync(
        `INSERT INTO refreshes (id, state, created_at)
         VALUES (?, ?, ?)`,
        ["refresh-1", "building", "2026-10-06T12:00:00.000Z"]
      );

      // Insert 3 refresh_feeds rows in known insertion order (rowid will be 1, 2, 3)
      await db.runAsync(
        `INSERT INTO refresh_feeds (refresh_id, feed_url, status, completed_at)
         VALUES (?, ?, ?, ?)`,
        ["refresh-1", "https://feed-a.com/rss", "success", "2026-10-06T12:00:00.000Z"]
      );
      await db.runAsync(
        `INSERT INTO refresh_feeds (refresh_id, feed_url, status, completed_at)
         VALUES (?, ?, ?, ?)`,
        ["refresh-1", "https://feed-b.com/rss", "success", "2026-10-06T12:00:00.000Z"]
      );
      await db.runAsync(
        `INSERT INTO refresh_feeds (refresh_id, feed_url, status, completed_at)
         VALUES (?, ?, ?, ?)`,
        ["refresh-1", "https://feed-c.com/rss", "success", "2026-10-06T12:00:00.000Z"]
      );

      // Run full migration (V3 adds position column and backfills)
      await runMigrations();

      // Verify position column exists and values are assigned by insertion order
      const rows = await db.getAllAsync<{ feed_url: string; position: number }>(
        `SELECT feed_url, position FROM refresh_feeds WHERE refresh_id = ? ORDER BY rowid`,
        ["refresh-1"]
      );

      expect(rows).toHaveLength(3);
      expect(rows[0].feed_url).toBe("https://feed-a.com/rss");
      expect(rows[0].position).toBe(0);
      expect(rows[1].feed_url).toBe("https://feed-b.com/rss");
      expect(rows[1].position).toBe(1);
      expect(rows[2].feed_url).toBe("https://feed-c.com/rss");
      expect(rows[2].position).toBe(2);
    });
  });

  describe("SCHEMA_VERSION", () => {
    it("should be 3", () => {
      expect(SCHEMA_VERSION).toBe(3);
    });
  });
});
