// SQL schema of noticioso.db.
//
// There are NO migrations: the database is a cache that the native module can
// rebuild at any time (the user's feed list lives in AsyncStorage). To change
// the schema, edit it here and bump SCHEMA_VERSION; on the next start a
// database with another version is dropped and recreated, and the next refresh
// fills it again. See db/README.md ("No migrations").
export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
-- Refresh generations table
-- Tracks each refresh attempt with its state
CREATE TABLE IF NOT EXISTS refreshes (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('building', 'ready', 'applied', 'superseded')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  applied_at TEXT,
  superseded_at TEXT
);

-- Per-feed status within a refresh
-- Tracks success/failure for each feed in a refresh generation
CREATE TABLE IF NOT EXISTS refresh_feeds (
  refresh_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  items_count INTEGER,
  completed_at TEXT,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (refresh_id, feed_url),
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id) ON DELETE CASCADE
);

-- Feed snapshots
-- Stores parsed feed data for each feed at a point in time
-- Multiple snapshots can exist per URL (one per refresh generation)
CREATE TABLE IF NOT EXISTS feed_snapshots (
  refresh_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  data TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (refresh_id, feed_url),
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id) ON DELETE CASCADE
);

-- Active refresh pointer
-- Single row tracking which refresh is currently active (visible to user)
CREATE TABLE IF NOT EXISTS active_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_id TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  FOREIGN KEY (refresh_id) REFERENCES refreshes(id)
);

-- Pending refresh pointer
-- Single row tracking which refresh is READY and waiting to be applied
CREATE TABLE IF NOT EXISTS pending_refresh (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_id TEXT,
  ready_at TEXT
);

-- Last fetch completion timestamp
-- Tracks when the last fetch completed (separate from apply time)
-- Used for foreground refresh logic (1 hour threshold)
CREATE TABLE IF NOT EXISTS last_fetch_completion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL
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

-- Article download jobs: one per (generation, article URL), written by the
-- native downloader; resumed after process death, failed jobs never retried
CREATE TABLE IF NOT EXISTS article_download_jobs (
  refresh_id TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'downloading', 'completed', 'failed')),
  file_path TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (refresh_id, url)
);

CREATE INDEX IF NOT EXISTS idx_article_download_jobs_refresh_id ON article_download_jobs(refresh_id);
CREATE INDEX IF NOT EXISTS idx_article_download_jobs_status ON article_download_jobs(status);
CREATE INDEX IF NOT EXISTS idx_article_download_jobs_url ON article_download_jobs(url);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_refreshes_state ON refreshes(state);
CREATE INDEX IF NOT EXISTS idx_refreshes_created_at ON refreshes(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_feeds_refresh_id ON refresh_feeds(refresh_id);
CREATE INDEX IF NOT EXISTS idx_feed_snapshots_refresh_id ON feed_snapshots(refresh_id);
CREATE INDEX IF NOT EXISTS idx_feed_snapshots_feed_url ON feed_snapshots(feed_url);
CREATE INDEX IF NOT EXISTS idx_article_metadata_last_accessed_at ON article_metadata(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_article_metadata_fetched_at ON article_metadata(fetched_at);
`;
