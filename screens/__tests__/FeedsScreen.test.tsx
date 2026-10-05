// Mocks must be set up BEFORE importing the screen under test
jest.mock("@/providers/FeedsProvider", () => ({
  useFeedsContext: jest.fn(),
}));

jest.mock("@/components/HTMLPagesNav", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    HTMLPagesNav: () =>
      React.createElement(Text, { testID: "html-pages-nav" }, "NAV"),
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
  updating: null,
  lastFullRefreshAt: "2026-10-03T10:00:00.000Z",
  shouldShowUpdateToast: false,
  refreshAllFeeds: jest.fn(),
  refreshAndUpdateToast: jest.fn(),
  dismissToast: jest.fn(),
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

  it("keeps the active feed list mounted while a native refresh is updating", () => {
    mockContext();

    const { rerender } = render(<Feeds />);
    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();

    mockContext({ updating: { name: "FETCHING", current: 0, total: 1 } });
    rerender(<Feeds />);

    // The existing list must NOT be replaced by a loading state
    expect(screen.getByTestId("html-pages-nav")).toBeTruthy();
    // Non-blocking refresh status is shown without hiding the list
    expect(screen.getByText("Fetching feeds 0 of 1")).toBeTruthy();
    // Header subtitle is hidden while updating (spinner replaces refresh icon)
    expect(screen.queryByText(/^Last full update at/)).toBeNull();
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
});
