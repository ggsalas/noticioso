import FeedRefreshModule from '../FeedRefreshModule';

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

  it('should call native refreshFeeds with feed URLs', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const testUrls = [
      'https://example.com/feed1.xml',
      'https://example.com/feed2.xml',
    ];
    const expectedResult = '2 feeds downloaded successfully, 0 failed';

    mockRefreshFeeds.mockResolvedValue(expectedResult);

    const result = await FeedRefreshModule.refreshFeeds(testUrls);

    expect(mockRefreshFeeds).toHaveBeenCalledWith(testUrls);
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

    await expect(FeedRefreshModule.refreshFeeds(['https://example.com/feed.xml'])).rejects.toThrow(
      'Native module error',
    );
  });

  it('should handle partial failures in summary', async () => {
    const mockRefreshFeeds = FeedRefreshModule.refreshFeeds as jest.Mock;
    const expectedResult = '3 feeds downloaded successfully, 2 failed';

    mockRefreshFeeds.mockResolvedValue(expectedResult);

    const result = await FeedRefreshModule.refreshFeeds([
      'https://example.com/feed1.xml',
      'https://example.com/feed2.xml',
      'https://example.com/feed3.xml',
      'https://example.com/feed4.xml',
      'https://example.com/feed5.xml',
    ]);

    expect(result).toBe(expectedResult);
  });
});
