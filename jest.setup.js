// Mock AsyncStorage for Jest testing
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// Mock expo-sqlite for Jest testing
jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn().mockImplementation(async (fn) => fn()),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    openDatabaseSync: jest.fn().mockReturnValue(mockDb),
    SQLiteDatabase: {
      NativeDatabase: jest.fn().mockImplementation(() => mockDb),
    },
  };
});

// Mock FeedRefreshModule for Jest testing
jest.mock('@/modules/FeedRefreshModule', () => ({
  __esModule: true,
  default: {
    refreshFeeds: jest.fn(),
  },
  toNativeFeedInput: (feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    oldestArticle: feed.oldestArticle,
    lang: feed.lang,
  }),
}));

// Enable jest-dom matchers from @testing-library/react-native
import "@testing-library/react-native/matchers";