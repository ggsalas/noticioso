// SQL schema definitions for noticioso.db
// Version 1: Initial migration from AsyncStorage

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
-- Feed cache: stores parsed RSS feed data with timestamps
CREATE TABLE IF NOT EXISTS feed_cache (
  url TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  cached_at TEXT NOT NULL
);

-- Last full refresh timestamp (single row)
CREATE TABLE IF NOT EXISTS last_full_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  timestamp TEXT NOT NULL
);

-- Article metadata: hero image, byline, title, excerpt, timestamps
CREATE TABLE IF NOT EXISTS article_metadata (
  url TEXT PRIMARY KEY,
  hero_image TEXT,
  byline TEXT,
  title TEXT,
  excerpt TEXT,
  fetched_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);

-- Migration state tracking (schema migrations)
CREATE TABLE IF NOT EXISTS migration_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);

-- Data migration completion tracking (separate from schema version)
-- Tracks one-time data imports (e.g. from AsyncStorage) that should not re-run
-- even if the user clears caches.
CREATE TABLE IF NOT EXISTS data_migrations (
  name TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
);

-- Indexes for efficient LRU queries
CREATE INDEX IF NOT EXISTS idx_feed_cache_cached_at ON feed_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_article_metadata_last_accessed_at ON article_metadata(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_article_metadata_fetched_at ON article_metadata(fetched_at);
`;
