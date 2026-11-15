// Mock AsyncStorage for Jest testing
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// Mock FeedRefreshModule for Jest testing
jest.mock('@/modules/FeedRefreshModule', () => ({
  __esModule: true,
  default: {
    refreshFeeds: jest.fn(),
    reconcileArticleDownloads: jest.fn(),
    applyPendingRefresh: jest.fn().mockResolvedValue(false),
    clearCaches: jest.fn().mockResolvedValue('Caches cleared'),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    isWorkerBusy: jest.fn().mockReturnValue(false),
    collectGarbage: jest.fn().mockResolvedValue('ok'),
    downloadArticle: jest.fn().mockResolvedValue('/cache/article.html'),
  },
  toNativeFeedInput: (feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    oldestArticle: Number(feed.oldestArticle),
    lang: feed.lang,
  }),
}));

jest.mock('@/modules/FeedRefreshModule/src/FeedRefreshModule', () => ({
  __esModule: true,
  default: {
    refreshFeeds: jest.fn(),
    reconcileArticleDownloads: jest.fn(),
    applyPendingRefresh: jest.fn().mockResolvedValue(false),
    clearCaches: jest.fn().mockResolvedValue('Caches cleared'),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    isWorkerBusy: jest.fn().mockReturnValue(false),
    collectGarbage: jest.fn().mockResolvedValue('ok'),
    downloadArticle: jest.fn().mockResolvedValue('/cache/article.html'),
  },
  toNativeFeedInput: (feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    oldestArticle: Number(feed.oldestArticle),
    lang: feed.lang,
  }),
}));

// Enable jest-dom matchers from @testing-library/react-native
import "@testing-library/react-native/matchers";
