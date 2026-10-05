import FeedRefreshModule, { toNativeFeedInput } from '../FeedRefreshModule';
import type { Feed } from '~/types';

// Mock the native module
jest.mock('expo', () => ({
  NativeModule: class {},
  requireNativeModule: () => ({
    refreshFeeds: jest.fn(),
  }),
}));

describe('FeedRefreshModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should expose refreshFeeds method', () => {
    expect(FeedRefreshModule.refreshFeeds).toBeDefined();
    expect(typeof FeedRefreshModule.refreshFeeds).toBe('function');
  });

  it('should call native refreshFeeds with feed objects', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const testFeeds: Feed[] = [
      {
        id: '1',
        name: 'Feed 1',
        url: 'https://example.com/feed1.xml',
        oldestArticle: 7,
        lang: 'en',
      },
      {
        id: '2',
        name: 'Feed 2',
        url: 'https://example.com/feed2.xml',
        oldestArticle: 1,
        lang: 'es',
      },
    ];
    const expectedResult = '2 feeds downloaded successfully, 0 failed';

    mockRefreshFeeds.mockResolvedValue(expectedResult);

    const nativeFeeds = testFeeds.map(toNativeFeedInput);
    const result = await FeedRefreshModule.refreshFeeds(nativeFeeds);

    expect(mockRefreshFeeds).toHaveBeenCalledWith(nativeFeeds);
    expect(mockRefreshFeeds).toHaveBeenCalledTimes(1);
    expect(result).toBe(expectedResult);
  });

  it('should handle empty feed list', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const expectedResult = '0 feeds downloaded successfully, 0 failed';

    mockRefreshFeeds.mockResolvedValue(expectedResult);

    const result = await FeedRefreshModule.refreshFeeds([]);

    expect(mockRefreshFeeds).toHaveBeenCalledWith([]);
    expect(result).toBe(expectedResult);
  });

  it('should propagate errors from native module', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const error = new Error('Native module error');

    mockRefreshFeeds.mockRejectedValue(error);

    await expect(
      FeedRefreshModule.refreshFeeds([
        {
          id: '1',
          name: 'Test Feed',
          url: 'https://example.com/feed.xml',
          oldestArticle: 7,
          lang: 'en',
        },
      ]),
    ).rejects.toThrow('Native module error');
  });

  it('should handle partial failures in summary', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const expectedResult = '3 feeds downloaded successfully, 2 failed';

    mockRefreshFeeds.mockResolvedValue(expectedResult);

    const testFeeds = [
      { id: '1', name: 'Feed 1', url: 'https://example.com/feed1.xml', oldestArticle: 7 as const, lang: 'en' as const },
      { id: '2', name: 'Feed 2', url: 'https://example.com/feed2.xml', oldestArticle: 7 as const, lang: 'en' as const },
      { id: '3', name: 'Feed 3', url: 'https://example.com/feed3.xml', oldestArticle: 7 as const, lang: 'en' as const },
      { id: '4', name: 'Feed 4', url: 'https://example.com/feed4.xml', oldestArticle: 7 as const, lang: 'en' as const },
      { id: '5', name: 'Feed 5', url: 'https://example.com/feed5.xml', oldestArticle: 7 as const, lang: 'en' as const },
    ];

    const nativeFeeds = testFeeds.map(toNativeFeedInput);
    const result = await FeedRefreshModule.refreshFeeds(nativeFeeds);

    expect(result).toBe(expectedResult);
  });

  describe('toNativeFeedInput', () => {
    it('should convert Feed to NativeFeedInput', () => {
      const feed: Feed = {
        id: '123',
        name: 'Test Feed',
        url: 'https://example.com/rss',
        oldestArticle: 7,
        lang: 'en',
      };

      const result = toNativeFeedInput(feed);

      expect(result).toEqual({
        id: '123',
        name: 'Test Feed',
        url: 'https://example.com/rss',
        oldestArticle: 7,
        lang: 'en',
      });
    });

    it('should convert string oldestArticle to number', () => {
      const feed = {
        id: '123',
        name: 'Test Feed',
        url: 'https://example.com/rss',
        oldestArticle: '7' as any,
        lang: 'en' as const,
      } as Feed;

      const result = toNativeFeedInput(feed);

      expect(result.oldestArticle).toBe(7);
      expect(typeof result.oldestArticle).toBe('number');
    });
  });
});
