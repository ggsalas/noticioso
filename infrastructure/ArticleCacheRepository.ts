import { getDatabase } from "./database";
import type { ArticleMetadata } from "~/types";

export interface ArticleMetadataRow {
  url: string;
  heroImage: string | null;
  byline: string | null;
  title: string | null;
  excerpt: string | null;
  fetchedAt: string;
  lastAccessedAt: string;
}

export class ArticleCacheRepository {
  async getMetadata(url: string): Promise<ArticleMetadata | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ArticleMetadataRow | undefined>(
      `SELECT url, hero_image as heroImage, byline, title, excerpt, 
              fetched_at as fetchedAt, last_accessed_at as lastAccessedAt
       FROM article_metadata WHERE url = ?`,
      [url]
    );

    if (!row) return null;

    return {
      heroImage: row.heroImage || undefined,
      byline: row.byline || "",
      title: row.title || "",
      excerpt: row.excerpt || "",
    };
  }

  async has(url: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM article_metadata WHERE url = ?",
      [url]
    );
    return (row?.count ?? 0) > 0;
  }

  async setMetadata(
    url: string,
    metadata: {
      heroImage?: string;
      byline?: string;
      title?: string;
      excerpt?: string;
      fetchedAt: string;
      lastAccessedAt: string;
    }
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO article_metadata 
       (url, hero_image, byline, title, excerpt, fetched_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        url,
        metadata.heroImage || null,
        metadata.byline || "",
        metadata.title || "",
        metadata.excerpt || "",
        metadata.fetchedAt,
        metadata.lastAccessedAt,
      ]
    );
  }

  async updateLastAccessed(url: string, lastAccessedAt: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE article_metadata SET last_accessed_at = ? WHERE url = ?",
      [lastAccessedAt, url]
    );
  }

  async delete(url: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM article_metadata WHERE url = ?", [url]);
  }

  async getAll(): Promise<ArticleMetadataRow[]> {
    const db = await getDatabase();
    return await db.getAllAsync<ArticleMetadataRow>(
      `SELECT url, hero_image as heroImage, byline, title, excerpt,
              fetched_at as fetchedAt, last_accessed_at as lastAccessedAt
       FROM article_metadata`
    );
  }

  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM article_metadata");
  }

  /**
   * Get URLs that have metadata rows from the provided list.
   * Chunks queries to stay below SQLite bind variable limits.
   */
  async getMetadataPresentUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];

    const db = await getDatabase();
    const presentUrls: string[] = [];

    // SQLite bind limit is typically 999, use chunks of 500 to be safe
    const CHUNK_SIZE = 500;

    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
      const chunk = urls.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");

      const rows = await db.getAllAsync<{ url: string }>(
        `SELECT url FROM article_metadata WHERE url IN (${placeholders})`,
        chunk
      );

      presentUrls.push(...rows.map(row => row.url));
    }

    return presentUrls;
  }
}

export const articleCacheRepository = new ArticleCacheRepository();
