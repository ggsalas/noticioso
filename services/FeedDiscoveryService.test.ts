import { FeedDiscoveryService } from "./FeedDiscoveryService";

const mockFetcher = jest.fn();
const feedDiscoveryService = new FeedDiscoveryService(mockFetcher);

describe("FeedDiscoveryService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use custom fetcher when provided", () => {
      const customMockFetcher = jest.fn();
      const service = new FeedDiscoveryService(customMockFetcher);
      expect(service).toBeInstanceOf(FeedDiscoveryService);
    });
  });

  describe("discoverFeeds", () => {
    it("should throw error when fetch fails with network error", async () => {
      mockFetcher.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        feedDiscoveryService.discoverFeeds("https://example.com")
      ).rejects.toThrow();
    });

    it("should throw error when fetch returns non-ok status", async () => {
      mockFetcher.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        feedDiscoveryService.discoverFeeds("https://example.com")
      ).rejects.toThrow("Failed to fetch");
    });

    it("should normalize URL without protocol", async () => {
      mockFetcher.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        feedDiscoveryService.discoverFeeds("example.com")
      ).rejects.toThrow();

      expect(mockFetcher).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Object)
      );
    });

    it("should call fetcher with the correct URL", async () => {
      mockFetcher.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        feedDiscoveryService.discoverFeeds("https://example.com/test")
      ).rejects.toThrow();

      expect(mockFetcher).toHaveBeenCalledWith(
        "https://example.com/test",
        expect.any(Object)
      );
    });

    it("should call fetcher with User-Agent header", async () => {
      mockFetcher.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        feedDiscoveryService.discoverFeeds("https://example.com")
      ).rejects.toThrow();

      expect(mockFetcher).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "Mozilla/5.0",
          }),
        })
      );
    });
  });
});
