import { Link, Stack, useRouter } from "expo-router";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { useState } from "react";
import { HandleRouterLinkData } from "@/types";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { formatLastRefresh } from "~/formatters/timeFormatters";

export default function Feeds() {
  const { colors, fonts, sizes, style } = useStyles();
  const {
    feeds,
    loading,
    error,
    feedArticleCounts,
    prefetching,
    lastFullRefreshAt,
    refreshAllFeeds,
  } = useFeedsContext();
  const router = useRouter();
  const [resetNavigation, setResetNavigation] = useState(1);

  const previousRoute = usePreviousRoute<{ feed_url: string }>();
  const previousArticleUrl = previousRoute?.params?.feed_url;

  const getRouteLink = (link: string) => `/feeds/${encodeURIComponent(link)}`;

  const visibleFeeds = feeds?.filter(
    ({ url }) =>
      feedArticleCounts[url] === undefined || feedArticleCounts[url] > 0,
  );

  const htmlItems =
    visibleFeeds?.length === 0
      ? '<div class="no-new-conent">No feeds found</div>'
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
                {prefetching
                  ? "Updating..."
                  : `Last full update at ${formatLastRefresh(lastFullRefreshAt)}`}
              </Text>
            </View>
          ),
          headerRight: () => (
            <>
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

      {loading && (
        <Text style={{ color: colors.text, padding: sizes.s1 }}>
          Loading...
        </Text>
      )}

      {((!loading && !feeds) || error) && (
        <>
          <Text>The app has failed to get the feed list</Text>
          <Text>content: {JSON.stringify(feeds, null, 4)}</Text>
          <Text>error:{JSON.stringify(error)}</Text>
        </>
      )}

      {!loading && feeds && (
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
  });

  return { colors, fonts, sizes, style };
}
