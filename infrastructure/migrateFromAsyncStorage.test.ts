import { migrateFromAsyncStorage, MIGRATION_MARKER } from './migrateFromAsyncStorage';
import { FeedCacheRepository } from './FeedCacheRepository';
import { ArticleCacheRepository } from './ArticleCacheRepository';
import { LastRefreshRepository } from './LastRefreshRepository';
import { DataMigrationRepository } from './DataMigrationRepository';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn(() => Promise.resolve()),
      runAsync: jest.fn(() => Promise.resolve()),
      getAllAsync: jest.fn(() => Promise.resolve([])),
      getFirstAsync: jest.fn(() => Promise.resolve(null)),
    })
  ),
}));

describe('migrateFromAsyncStorage', () => {
  let feedCacheRepo: FeedCacheRepository;
  let articleCacheRepo: ArticleCacheRepository;
  let lastRefreshRepo: LastRefreshRepository;
  let dataMigrationRepo: DataMigrationRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();

    feedCacheRepo = new FeedCacheRepository();
    articleCacheRepo = new ArticleCacheRepository();
    lastRefreshRepo = new LastRefreshRepository();
    dataMigrationRepo = new DataMigrationRepository();
  });

  describe('idempotence', () => {
    it('should be idempotent - running migration twice yields same result', async () => {
      // Setup initial AsyncStorage data
      const feedData = {
        data: {
          date: new Date('2024-01-01'),
          rss: {
            channel: {
              title: 'Test Feed',
              description: 'Test Description',
              language: 'en',
              link: 'http://example.com',
              lastBuildDate: '2024-01-01T00:00:00Z',
              item: [],
            },
          },
          feedType: 'rss' as const,
        },
        cachedAt: '2024-01-01T00:00:00Z',
      };
      await AsyncStorage.setItem('@noticioso-feedCache-test-url', JSON.stringify(feedData));

      const articleData = {
        title: 'Test Article',
        byline: 'Author',
        heroImage: 'http://example.com/image.jpg',
        excerpt: 'Excerpt',
        fetchedAt: '2024-01-01T00:00:00Z',
        lastAccessedAt: '2024-01-01T00:00:00Z',
      };
      await AsyncStorage.setItem(
        '@noticioso-articleHtmlCache-test-article',
        JSON.stringify(articleData)
      );

      await AsyncStorage.setItem('@noticioso-lastFullRefresh', '2024-01-01T00:00:00Z');

      // Track what has been "stored" in the mock repositories
      const storedFeeds = new Set<string>();
      const storedArticles = new Set<string>();
      let storedLastRefresh = false;

      // Spy on repository methods to simulate storage behavior
      const feedGetSpy = jest.spyOn(feedCacheRepo, 'get').mockImplementation(async (url) => {
        return storedFeeds.has(url) ? feedData as any : null;
      });
      const feedSetSpy = jest.spyOn(feedCacheRepo, 'set').mockImplementation(async (url) => {
        storedFeeds.add(url);
      });

      const articleGetSpy = jest.spyOn(articleCacheRepo, 'getMetadata').mockImplementation(async (url) => {
        return storedArticles.has(url) ? articleData : null;
      });
      const articleSetSpy = jest.spyOn(articleCacheRepo, 'setMetadata').mockImplementation(async (url) => {
        storedArticles.add(url);
      });

      const lastRefreshGetSpy = jest.spyOn(lastRefreshRepo, 'get').mockImplementation(async () => {
        return storedLastRefresh ? '2024-01-01T00:00:00Z' : null;
      });
      const lastRefreshSetSpy = jest.spyOn(lastRefreshRepo, 'set').mockImplementation(async () => {
        storedLastRefresh = true;
      });

      // Run migration first time
      await migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo);

      // Count calls after first migration
      const firstFeedCalls = feedSetSpy.mock.calls.length;
      const firstArticleCalls = articleSetSpy.mock.calls.length;
      const firstLastRefreshCalls = lastRefreshSetSpy.mock.calls.length;

      expect(firstFeedCalls).toBe(1);
      expect(firstArticleCalls).toBe(1);
      expect(firstLastRefreshCalls).toBe(1);

      // Run migration second time
      await migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo);

      // Second migration should not insert duplicates (should skip existing data)
      expect(feedSetSpy.mock.calls.length).toBe(firstFeedCalls);
      expect(articleSetSpy.mock.calls.length).toBe(firstArticleCalls);
      expect(lastRefreshSetSpy.mock.calls.length).toBe(firstLastRefreshCalls);
    });

    it('should skip already migrated feed caches', async () => {
      const feedData = {
        data: {
          date: new Date('2024-01-01'),
          rss: {
            channel: {
              title: 'Test Feed',
              link: 'http://example.com',
              description: 'Test',
              language: 'en',
              lastBuildDate: '2024-01-01T00:00:00Z',
              item: [],
            },
          },
          feedType: 'rss' as const,
        },
        cachedAt: '2024-01-01T00:00:00Z',
      };
      await AsyncStorage.setItem('@noticioso-feedCache-url1', JSON.stringify(feedData));

      // Mock repository to simulate existing data
      const getSpy = jest.spyOn(feedCacheRepo, 'get').mockResolvedValue(feedData);
      const setSpy = jest.spyOn(feedCacheRepo, 'set');

      await migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo);

      // Should not call set if data already exists
      expect(getSpy).toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('should skip already migrated article metadata', async () => {
      const articleData = {
        title: 'Test Article',
        byline: 'Author',
        heroImage: 'http://example.com/image.jpg',
        excerpt: 'Excerpt',
        fetchedAt: '2024-01-01T00:00:00Z',
        lastAccessedAt: '2024-01-01T00:00:00Z',
      };
      await AsyncStorage.setItem(
        '@noticioso-articleHtmlCache-url1',
        JSON.stringify(articleData)
      );

      // Mock repository to simulate existing data
      const getMetadataSpy = jest
        .spyOn(articleCacheRepo, 'getMetadata')
        .mockResolvedValue(articleData);
      const setMetadataSpy = jest.spyOn(articleCacheRepo, 'setMetadata');

      await migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo);

      // Should not call setMetadata if data already exists
      expect(getMetadataSpy).toHaveBeenCalled();
      expect(setMetadataSpy).not.toHaveBeenCalled();
    });

    it('should skip already migrated last refresh timestamp', async () => {
      await AsyncStorage.setItem('@noticioso-lastFullRefresh', '2024-01-01T00:00:00Z');

      // Mock repository to simulate existing data
      const getSpy = jest
        .spyOn(lastRefreshRepo, 'get')
        .mockResolvedValue('2024-01-01T00:00:00Z');
      const setSpy = jest.spyOn(lastRefreshRepo, 'set');

      await migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo);

      // Should not call set if data already exists
      expect(getSpy).toHaveBeenCalled();
      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe('durable migration marker', () => {
    /**
     * Simulates a durable data_migrations table with an in-memory set so the
     * marker persists across migration runs (and across SQL cache clears).
     */
    function stubMarkerRepo(repo: DataMigrationRepository, store: Set<string>) {
      const isCompletedSpy = jest
        .spyOn(repo, 'isCompleted')
        .mockImplementation(async (name) => store.has(name));
      const markSpy = jest
        .spyOn(repo, 'markCompleted')
        .mockImplementation(async (name) => {
          store.add(name);
        });
      return { isCompletedSpy, markSpy };
    }

    const feedPayload = {
      data: { items: [] },
      cachedAt: '2024-01-01T00:00:00Z',
    };

    it('writes the marker after all steps complete successfully', async () => {
      await AsyncStorage.setItem('@noticioso-feedCache-url1', JSON.stringify(feedPayload));
      await AsyncStorage.setItem('@noticioso-lastFullRefresh', '2024-01-01T00:00:00Z');

      const markerStore = new Set<string>();
      const { markSpy } = stubMarkerRepo(dataMigrationRepo, markerStore);

      await migrateFromAsyncStorage(
        feedCacheRepo,
        articleCacheRepo,
        lastRefreshRepo,
        dataMigrationRepo
      );

      expect(markSpy).toHaveBeenCalledTimes(1);
      expect(markSpy).toHaveBeenCalledWith(MIGRATION_MARKER);
      expect(markerStore.has(MIGRATION_MARKER)).toBe(true);
    });

    it('prevents reimport after a SQL cache clear (marker persists)', async () => {
      // Legacy AsyncStorage backup data still present
      await AsyncStorage.setItem('@noticioso-feedCache-url1', JSON.stringify(feedPayload));
      await AsyncStorage.setItem(
        '@noticioso-articleHtmlCache-url1',
        JSON.stringify({ title: 'A', fetchedAt: '2024-01-01T00:00:00Z' })
      );
      await AsyncStorage.setItem('@noticioso-lastFullRefresh', '2024-01-01T00:00:00Z');

      const markerStore = new Set<string>();
      stubMarkerRepo(dataMigrationRepo, markerStore);

      // First run: imports everything
      const feedSetSpy = jest.spyOn(feedCacheRepo, 'set').mockResolvedValue(undefined);
      const articleSetSpy = jest
        .spyOn(articleCacheRepo, 'setMetadata')
        .mockResolvedValue(undefined);
      const refreshSetSpy = jest.spyOn(lastRefreshRepo, 'set').mockResolvedValue(undefined);

      await migrateFromAsyncStorage(
        feedCacheRepo,
        articleCacheRepo,
        lastRefreshRepo,
        dataMigrationRepo
      );

      expect(feedSetSpy).toHaveBeenCalledTimes(1);
      expect(articleSetSpy).toHaveBeenCalledTimes(1);
      expect(refreshSetSpy).toHaveBeenCalledTimes(1);
      expect(markerStore.has(MIGRATION_MARKER)).toBe(true);

      // Simulate intentional cache clear: SQL rows removed, legacy AsyncStorage
      // keys preserved, marker NOT cleared (clearCaches does not touch it).
      feedSetSpy.mockClear();
      articleSetSpy.mockClear();
      refreshSetSpy.mockClear();

      // Next launch: migration must not repopulate caches from backups
      await migrateFromAsyncStorage(
        feedCacheRepo,
        articleCacheRepo,
        lastRefreshRepo,
        dataMigrationRepo
      );

      expect(feedSetSpy).not.toHaveBeenCalled();
      expect(articleSetSpy).not.toHaveBeenCalled();
      expect(refreshSetSpy).not.toHaveBeenCalled();
      expect(markerStore.has(MIGRATION_MARKER)).toBe(true);
    });

    it('does not write the marker when a repository write fails, and rerun retries', async () => {
      // Two feeds: one imports fine, one hits a db write failure
      await AsyncStorage.setItem('@noticioso-feedCache-ok-url', JSON.stringify(feedPayload));
      await AsyncStorage.setItem('@noticioso-feedCache-fail-url', JSON.stringify(feedPayload));

      const markerStore = new Set<string>();
      const { markSpy } = stubMarkerRepo(dataMigrationRepo, markerStore);

      // Simulate persistent SQLite state: rows survive the failed run
      const storedFeeds = new Map<string, unknown>();
      jest.spyOn(feedCacheRepo, 'get').mockImplementation(async (url) => {
        const row = storedFeeds.get(url);
        return row ? (feedPayload as any) : null;
      });
      const feedSetSpy = jest
        .spyOn(feedCacheRepo, 'set')
        .mockImplementation(async (url, data, cachedAt) => {
          if (url === 'fail-url') {
            throw new Error('SIMULATED DB WRITE FAILURE');
          }
          storedFeeds.set(url, { data, cachedAt });
        });

      // First run: write failure propagates, marker NOT written
      await expect(
        migrateFromAsyncStorage(
          feedCacheRepo,
          articleCacheRepo,
          lastRefreshRepo,
          dataMigrationRepo
        )
      ).rejects.toThrow('SIMULATED DB WRITE FAILURE');

      expect(markSpy).not.toHaveBeenCalled();
      expect(markerStore.has(MIGRATION_MARKER)).toBe(false);

      // Recovery: db write fixed, rerun resumes
      feedSetSpy.mockImplementation(async (url, data, cachedAt) => {
        storedFeeds.set(url, { data, cachedAt });
      });

      await migrateFromAsyncStorage(
        feedCacheRepo,
        articleCacheRepo,
        lastRefreshRepo,
        dataMigrationRepo
      );

      // ok-url was skipped (already imported), fail-url retried and imported
      const okUrlWrites = feedSetSpy.mock.calls.filter((call) => call[0] === 'ok-url').length;
      expect(okUrlWrites).toBe(1);
      expect(storedFeeds.has('ok-url')).toBe(true);
      expect(storedFeeds.has('fail-url')).toBe(true);

      // Marker written only after the fully successful rerun
      expect(markSpy).toHaveBeenCalledTimes(1);
      expect(markSpy).toHaveBeenCalledWith(MIGRATION_MARKER);
    });

    it('treats malformed article-index JSON as non-fatal and still completes', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await AsyncStorage.setItem('@noticioso-articleHtmlCache-index', '{invalid json!!');
      await AsyncStorage.setItem(
        '@noticioso-articleHtmlCache-url1',
        JSON.stringify({
          title: 'Article',
          byline: 'Author',
          fetchedAt: '2024-02-02T00:00:00Z',
          lastAccessedAt: '2024-02-03T00:00:00Z',
        })
      );

      jest.spyOn(articleCacheRepo, 'getMetadata').mockResolvedValue(null);
      const setMetadataSpy = jest
        .spyOn(articleCacheRepo, 'setMetadata')
        .mockResolvedValue(undefined);

      const markerStore = new Set<string>();
      const { markSpy } = stubMarkerRepo(dataMigrationRepo, markerStore);

      await expect(
        migrateFromAsyncStorage(
          feedCacheRepo,
          articleCacheRepo,
          lastRefreshRepo,
          dataMigrationRepo
        )
      ).resolves.not.toThrow();

      // Entry still imported, falling back to the metadata's own timestamps
      expect(setMetadataSpy).toHaveBeenCalledTimes(1);
      const [, metadataArg] = setMetadataSpy.mock.calls[0];
      expect(metadataArg.fetchedAt).toBe('2024-02-02T00:00:00Z');
      expect(metadataArg.lastAccessedAt).toBe('2024-02-03T00:00:00Z');

      // Malformed index was logged
      expect(warnSpy).toHaveBeenCalled();

      // Migration completed and marker written despite malformed index
      expect(markSpy).toHaveBeenCalledWith(MIGRATION_MARKER);
      expect(markerStore.has(MIGRATION_MARKER)).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('retry and failure handling', () => {
    it('should continue migration if feed cache migration fails', async () => {
      await AsyncStorage.setItem(
        '@noticioso-feedCache-bad',
        'invalid json'
      );
      await AsyncStorage.setItem('@noticioso-lastFullRefresh', '2024-01-01T00:00:00Z');

      // Should not throw, should continue with other migrations
      await expect(
        migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo)
      ).resolves.not.toThrow();
    });

    it('should handle missing AsyncStorage keys gracefully', async () => {
      // No keys in AsyncStorage
      await expect(
        migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo)
      ).resolves.not.toThrow();
    });

    it('should migrate partial data successfully', async () => {
      // Only feed cache, no articles or last refresh
      const feedData = {
        data: {
          date: new Date('2024-01-01'),
          rss: {
            channel: {
              title: 'Test Feed',
              description: 'Test Description',
              language: 'en',
              link: 'http://example.com',
              lastBuildDate: '2024-01-01T00:00:00Z',
              item: [],
            },
          },
          feedType: 'rss' as const,
        },
        cachedAt: '2024-01-01T00:00:00Z',
      };
      await AsyncStorage.setItem('@noticioso-feedCache-url1', JSON.stringify(feedData));

      const setSpy = jest.spyOn(feedCacheRepo, 'set');

      await expect(
        migrateFromAsyncStorage(feedCacheRepo, articleCacheRepo, lastRefreshRepo, dataMigrationRepo)
      ).resolves.not.toThrow();

      // Should have attempted to migrate feed cache
      expect(setSpy).toHaveBeenCalled();
    });
  });
});
