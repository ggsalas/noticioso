import { Link, Stack, useRouter } from "expo-router";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { useState } from "react";
import { HandleRouterLinkData } from "@/types";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { NewArticlesToast } from "@/components/NewArticlesToast";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLastRefresh } from "~/formatters/timeFormatters";
import { feedService } from "@/services/FeedService";

export default function Feeds() {
  const { colors, fonts, sizes, style } = useStyles();
  const {
    feeds,
    loading,
    error,
    feedArticleCounts,
    updating,
    lastFullRefreshAt,
    shouldShowUpdateToast,
    refreshAllFeeds,
    refreshAndUpdateToast,
    dismissToast,
  } = useFeedsContext();
  const router = useRouter();
  const [resetNavigation, setResetNavigation] = useState(1);
  const [cacheCleared, setCacheCleared] = useState(false);

  const previousRoute = usePreviousRoute<{ feed_url: string }>();
  const previousArticleUrl = previousRoute?.params?.feed_url;

  const getRouteLink = (link: string) => `/feeds/${encodeURIComponent(link)}`;

  const visibleFeeds = feeds?.filter(
    ({ url }) =>
      feedArticleCounts[url] !== undefined && feedArticleCounts[url] > 0,
  );

  const htmlItems =
    visibleFeeds?.length === 0
      ? '<div class="no-new-conent"><h3>No content to show.</h3> <p>Swipe down to get updates <br />or add a new feed.</p></div>'
      : visibleFeeds
          ?.map(
            ({ name, url }: any) => `
            <div 
              class="item" 
              data-route-link="${getRouteLink(url)}" 
            >
              <h3 class="title">${name}${feedArticleCounts[url] !== undefined ? ` (${feedArticleCounts[url]})` : ""}</h3>
            </div>
          `,
          )
          .join("");

  const html = `
    <style>
      .item {
        border-bottom: 1px solid ${colors.borderDark};
        display: flex;
        flex-direction: column;
        padding: ${sizes.s1}px 0;
        text-decoration: none;
        break-inside: avoid;
      }

      ${previousArticleUrl ? `.item[data-route-link*="${getRouteLink(previousArticleUrl)}"] { border-bottom-width: 5px; }` : ""}

      .title {
        color: ${colors.text};
        font-size: ${fonts.fontSizeH4}px;
        line-height: ${fonts.lineHeightComfortable}px;
        font-weight: bold;
        margin: 0;
      }

      .no-new-conent {
        color: ${colors.text};
        font-size: ${fonts.fontSizeP}px;
        font-weight: bold;
        line-height: ${fonts.lineHeightComfortable}px;
        margin: 0;
        padding: ${sizes.s1}px 0;
      }
    </style>

    ${htmlItems}
  `;

  const load = loading || updating;

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
                {updating
                  ? ""
                  : `Last full update at ${formatLastRefresh(lastFullRefreshAt)}`}
              </Text>
            </View>
          ),
          headerRight: () => (
            <>
              <Pressable
                style={style.rightButton}
                android_ripple={{ color: colors.textGrey, borderless: true }}
                onPress={async () => {
                  try {
                    await feedService.clearCaches();
                    setCacheCleared(true);
                    setTimeout(() => setCacheCleared(false), 2000);
                  } catch (e) {
                    console.error("Failed to clear caches:", e);
                  }
                }}
              >
                <MaterialIcons
                  name={cacheCleared ? "check" : "delete-sweep"}
                  size={sizes.s1}
                  color={cacheCleared ? colors.tint : colors.text}
                />
              </Pressable>
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
            </>
          ),
        }}
      />

      <NewArticlesToast
        visible={shouldShowUpdateToast}
        onPress={refreshAndUpdateToast}
        onDismiss={dismissToast}
      />

      {load && (
        <Text style={{ color: colors.text, padding: sizes.s1 }}>
          Loading...
        </Text>
      )}

      {((!load && !feeds) || error) && (
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

      {!load && feeds && !error && (
        <HTMLPagesNav
          key={resetNavigation}
          name="feed"
          html={html}
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
    content: {
      fontSize: fonts.fontSizeP,
      color: colors.text,
      padding: sizes.s1,
    },
    contentCode: {
      fontFamily: fonts.fontFamilyCodeRegular,
      fontSize: fonts.fontSizeCode,
      color: colors.text,
      padding: sizes.s1,
    },
  });

  return { colors, fonts, sizes, style };
}
