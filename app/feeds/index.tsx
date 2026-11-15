import { Link, Stack, useRouter, useFocusEffect } from "expo-router";
import { Pressable, Text, StyleSheet, View, ActivityIndicator } from "react-native";
import { useCallback, useMemo, useState } from "react";
import { HandleRouterLinkData } from "@/types";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { NewArticlesToast } from "@/components/NewArticlesToast";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLastRefresh } from "~/formatters/timeFormatters";
import { useWebViewHighlight } from "~/hooks/useWebViewHighlight";

export default function Feeds() {
  const { colors, fonts, sizes, style } = useStyles();
  const {
    feeds,
    loading,
    error,
    feedArticleCounts,
    feedArticleCacheComplete,
    updating,
    lastFullRefreshAt,
    shouldShowUpdateToast,
    articleDownloadProgress,
    refreshAllFeeds,
    refreshAndUpdateToast,
    dismissToast,
    refreshActiveFeedCacheState,
  } = useFeedsContext();

  const getStatusLabel = (status: {
    name: string;
    current: number;
    total: number;
  }) => {
    switch (status.name) {
      case "FETCHING":
        return `Fetching feeds ${status.current} of ${status.total}`;
      default:
        return "Loading...";
    }
  };

  const hasFeedData = !!feeds?.length;
  const showInitialLoading = !!loading && !hasFeedData;
  const router = useRouter();
  const [resetNavigation, setResetNavigation] = useState(1);

  // Refresh cache completeness state when this route becomes active
  useFocusEffect(
    useCallback(() => {
      refreshActiveFeedCacheState();
    }, [refreshActiveFeedCacheState])
  );

  const handleNativeRefresh = useCallback(async () => {
    if (updating || articleDownloadProgress?.status === "fetching") return;
    await refreshAllFeeds();
  }, [updating, articleDownloadProgress, refreshAllFeeds]);

  const previousRoute = usePreviousRoute<{ feed_url: string }>();
  const previousFeedUrl = previousRoute?.params?.feed_url;

  const getRouteLink = useCallback(
    (link: string) => `/feeds/${encodeURIComponent(link)}`,
    [],
  );

  const postLoadScript = useWebViewHighlight(previousFeedUrl, getRouteLink);

  const visibleFeeds = feeds?.filter(
    ({ url }) =>
      feedArticleCounts[url] !== undefined && feedArticleCounts[url] > 0,
  );

  const htmlItems = useMemo(
    () =>
      visibleFeeds?.length === 0
        ? '<div class="no-new-content"><h3>No content to show.</h3> <p>Swipe down to get updates <br />or add a new feed.</p></div>'
        : visibleFeeds
            ?.map(
              ({ name, url }: any) => {
                const isComplete = feedArticleCacheComplete[url] === true;
                const circleIndicator = isComplete
                  ? ` <span style="color: ${colors.text};" title="All articles cached" aria-label="All articles cached">●</span>`
                  : "";
                return `
                <div
                  class="item"
                  data-route-link="${getRouteLink(url)}"
                >
                  <h3 class="title">${name}${feedArticleCounts[url] !== undefined ? ` (${feedArticleCounts[url]})` : ""}${circleIndicator}</h3>
                </div>
              `;
              },
            )
            .join(""),
    [visibleFeeds, feedArticleCounts, feedArticleCacheComplete, getRouteLink, colors.text],
  );

  const html = useMemo(
    () => `
    <style>
      .item {
        border-bottom: 1px solid ${colors.borderDark};
        display: flex;
        flex-direction: column;
        padding: ${sizes.s1}px 0;
        text-decoration: none;
        break-inside: avoid;
      }

      .title {
        color: ${colors.text};
        font-size: ${fonts.fontSizeH4}px;
        line-height: ${fonts.lineHeightComfortable}px;
        font-weight: bold;
        margin: 0;
      }

      .no-new-content {
        color: ${colors.text};
        font-size: ${fonts.fontSizeP}px;
        font-weight: bold;
        line-height: ${fonts.lineHeightComfortable}px;
        margin: 0;
        padding: ${sizes.s1}px 0;
      }
    </style>

    ${htmlItems}
  `,
    [htmlItems, colors, fonts, sizes],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={style.headerContainer}>
              <Text
                style={style.headerTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                Noticioso
              </Text>
              <Text
                style={style.headerSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {`Last full update at ${formatLastRefresh(lastFullRefreshAt)}`}
              </Text>
            </View>
          ),
          headerRight: () => {
            const isUpdatingFeeds = !!updating;
            const isFetchingArticles = articleDownloadProgress?.status === "fetching";
            const workerLabel = isUpdatingFeeds
              ? "Updating feeds"
              : isFetchingArticles
                ? `Fetching articles ${articleDownloadProgress.feedIndex}/${articleDownloadProgress.feedCount}`
                : null;

            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: sizes.s1 }}>
                {workerLabel ? (
                  <View style={[style.rightButton, { flexDirection: "row", alignItems: "center", gap: sizes.s0_50 }]}>
                    <ActivityIndicator size="small" color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: fonts.marginP }} numberOfLines={1}>
                      {workerLabel}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    style={style.rightButton}
                    android_ripple={{ color: colors.textGrey, borderless: true }}
                    onPress={handleNativeRefresh}
                  >
                    <MaterialIcons
                      name="refresh"
                      size={sizes.s1}
                      color={colors.text}
                    />
                  </Pressable>
                )}
                <Link href="/config/feedList" asChild>
                  <Pressable
                    style={style.rightButton}
                    android_ripple={{ color: colors.textGrey, borderless: true }}
                  >
                    <MaterialIcons
                      name="settings"
                      size={sizes.s1}
                      color={colors.text}
                    />
                  </Pressable>
                </Link>
              </View>
            );
          },
        }}
      />

      <NewArticlesToast
        visible={shouldShowUpdateToast}
        onPress={refreshAndUpdateToast}
        onDismiss={dismissToast}
      />

      {showInitialLoading && (
        <Text style={{ color: colors.text, padding: sizes.s1 }}>
          {loading ? getStatusLabel(loading) : "Loading..."}
        </Text>
      )}

      {!hasFeedData && !loading && error && (
        <>
          <Text style={style.content}>
            The app has failed to get the feed list
          </Text>
          <Text style={style.contentCode}>
            content: {JSON.stringify(feeds, null, 4)}
          </Text>
          <Text style={style.contentCode}>error:{JSON.stringify(error)}</Text>
        </>
      )}

      {feeds?.length === 0 && !loading && !error && (
        <View style={style.contentWrapper}>
          <Text style={style.content}>There are no feeds to show</Text>
          <View style={style.actions}>
            <Link href="/searchFeedUrl" asChild>
              <Pressable style={style.button}>
                <Text style={style.buttonText}>Add your first feed</Text>
              </Pressable>
            </Link>

            <Text style={style.buttonText}>or</Text>

            <Link href="/config/settings" asChild>
              <Pressable style={style.button}>
                <Text style={style.buttonText}>Go to configurations</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      )}

      {hasFeedData && feeds.length > 0 && (
        <HTMLPagesNav
          key={resetNavigation}
          name="feed"
          html={html}
          postLoadScript={postLoadScript}
          actions={{
            top: {
              label: "Refresh All Feeds",
              action: refreshAllFeeds,
            },
            bottom: {
              label: "Page 1",
              action: () => setResetNavigation((val) => val + 1),
            },
            first: {
              label: "Page 1",
              action: () => setResetNavigation((val) => val + 1),
            },
            last: {
              label: "Page 1",
              action: () => setResetNavigation((val) => val + 1),
            },
          }}
          handleRouterLink={({ path }: HandleRouterLinkData) => {
            router.navigate(path);
          }}
        />
      )}
    </>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    rightButton: {},
    rightButtonText: {
      fontSize: fonts.marginP,
      color: colors.text,
    },
    headerContainer: {
      flexBasis: "80%",
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
      overflow: "hidden",
    },
    headerSubtitle: {
      fontSize: 14,
      lineHeight: 18,
      height: 18,
      color: colors.text,
      overflow: "hidden",
    },
    contentWrapper: {
      padding: sizes.s1,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    content: {
      fontFamily: fonts.fontFamilyRegular,
      fontSize: fonts.fontSizeP,
      color: colors.text,
    },
    contentCode: {
      fontFamily: fonts.fontFamilyCodeRegular,
      fontSize: fonts.fontSizeCode,
      color: colors.text,
    },
    actions: {
      flex: 1,
      flexDirection: "column",
      gap: sizes.s1,
      marginVertical: sizes.s1,
    },
    button: {
      backgroundColor: colors.background,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      borderWidth: 1,
      borderColor: colors.text,
    },
    buttonText: {
      color: colors.text,
      fontSize: fonts.baseFontSize,
      fontFamily: fonts.fontFamilyBold,
      textAlign: "center",
    },
  });

  return { colors, fonts, sizes, style };
}
