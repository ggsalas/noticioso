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

export class ArticleMetadataRepository {
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
}

export const articleMetadataRepository = new ArticleMetadataRepository();
