// Mocks must be set up BEFORE importing the screen under test
jest.mock("@/providers/FeedsProvider", () => ({
  useFeedsContext: jest.fn(),
}));

jest.mock("@/components/HTMLPagesNav", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    HTMLPagesNav: (props: any) =>
      React.createElement(Text, { testID: "html-pages-nav", html: props.html }, "NAV"),
  };
});

jest.mock("@/components/NewArticlesToast", () => ({
  NewArticlesToast: () => null,
}));

jest.mock("~/providers/PreviousRoute", () => ({
  usePreviousRoute: () => null,
}));

jest.mock("~/hooks/useWebViewHighlight", () => ({
  useWebViewHighlight: () => undefined,
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialIcons: () => null,
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Link: ({ children }: any) => children,
    Stack: {
      // Render the header callbacks so header indicators are testable
      Screen: ({ options }: any) =>
        React.createElement(
          React.Fragment,
          null,
          options?.headerTitle ? options.headerTitle() : null,
          options?.headerRight ? options.headerRight() : null,
        ),
    },
    useRouter: () => ({ navigate: jest.fn() }),
    useFocusEffect: (callback: () => void) => {
      // Execute the callback immediately in tests
      React.useEffect(() => {
        callback();
      }, []);
    },
  };
});

import { render, screen } from "@testing-library/react-native";
import Feeds from "~/app/feeds";
import { useFeedsContext } from "@/providers/FeedsProvider";

const mockFeeds = [
  {
    id: "1",
    name: "Feed 1",
    url: "https://feed1.com",
    oldestArticle: 1 as const,
    lang: "en" as const,
  },
];

const baseContext = {
  feeds: mockFeeds,
  loading: null,
  error: null,
  feedArticleCounts: { "https://feed1.com": 5 },
  feedArticleCacheComplete: {},
  updating: null,
  lastFullRefreshAt: "2026-10-03T10:00:00.000Z",
  shouldShowUpdateToast: false,
  articleDownloadProgress: null,
  refreshAllFeeds: jest.fn(),
  refreshAndUpdateToast: jest.fn(),
  dismissToast: jest.fn(),
  refreshActiveFeedCacheState: jest.fn(),
};

function mockContext(overrides: Record<string, unknown> = {}) {
  (useFeedsContext as jest.Mock).mockReturnValue({
    ...baseContext,
    ...overrides,
  });
}

describe("Feeds screen (app/feeds)", () => {
  it("shows the initial loading state instead of the feed list", () => {
    mockContext({
      feeds: null,
      loading: { name: "FETCHING", current: 0, total: 0 },
    });

    render(<Feeds />);

    expect(screen.getByText("Fetching feeds 0 of 0")).toBeTruthy();
    expect(screen.queryByTestId("html-pages-nav")).toBeNull();
    expect(
      screen.queryByText("The app has failed to get the feed list"),
    ).toBeNull();
  });

  it("keeps the current list visible during a feed-list recheck", () => {
    mockContext({ loading: { name: "FETCHING", current: 0, total: 1 } });

    render(<Feeds />);

    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();
    expect(screen.queryByText("Fetching feeds 0 of 1")).toBeNull();
  });

  it("keeps the active feed list mounted while a native refresh is updating", () => {
    mockContext();

    const { rerender } = render(<Feeds />);
    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();

    mockContext({ updating: { name: "FETCHING", current: 0, total: 1 } });
    rerender(<Feeds />);

    // The existing list must NOT be replaced by a loading state
    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();
    // Worker label replaces the refresh control while the applied timestamp remains stable.
    expect(screen.getByText("Updating feeds")).toBeTruthy();
    expect(screen.getByText(/Last full update at/)).toBeTruthy();
  });

  it("shows per-feed article download progress in header without hiding the active list", () => {
    mockContext({
      articleDownloadProgress: {
        refreshId: "refresh-1",
        status: "fetching",
        feedIndex: 2,
        feedCount: 5,
        articleCount: 10,
        articleSuccessCount: 8,
        articleFailedCount: 2,
      },
    });

    render(<Feeds />);

    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();
    expect(screen.getByText("Fetching articles 2/5")).toBeTruthy();
  });

  it("shows the last full update time when not updating", () => {
    mockContext();

    render(<Feeds />);

    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();
    expect(screen.getByText(/Last full update at/)).toBeTruthy();
  });

  it("shows the empty state when there are no feeds", () => {
    mockContext({ feeds: [] });

    render(<Feeds />);

    expect(screen.getByText("There are no feeds to show")).toBeTruthy();
    expect(screen.queryByTestId("html-pages-nav")).toBeNull();
  });

  it("shows filled circle indicator when feed cache is complete", () => {
    mockContext({
      feedArticleCacheComplete: { "https://feed1.com": true },
    });

    render(<Feeds />);

    // Check that the HTML contains the filled circle indicator
    const navElement = screen.getByTestId("html-pages-nav");
    expect(navElement).toBeTruthy();
    // The indicator should be present in the HTML content
    expect(navElement.props.html).toContain("●");
    expect(navElement.props.html).toContain("All articles cached");
  });

  it("does not show filled circle indicator when feed cache is incomplete", () => {
    mockContext({
      feedArticleCacheComplete: { "https://feed1.com": false },
    });

    render(<Feeds />);

    const navElement = screen.getByTestId("html-pages-nav");
    expect(navElement).toBeTruthy();
    // The indicator should not be present in the HTML content
    expect(navElement.props.html).not.toContain("●");
  });
});
