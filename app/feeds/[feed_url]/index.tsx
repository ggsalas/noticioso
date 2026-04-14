import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { useFeedContent } from "~/hooks/useFeedContent";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useThemeContext } from "@/theme/ThemeProvider";
import { FeedContentItem, HandleLinkData, HandleRouterLinkData } from "@/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Text, View, StyleSheet } from "react-native";
import { formatLastRefresh } from "~/formatters/timeFormatters";

export default function FeedPage() {
  const { colors, fonts, sizes, style } = useStyles();
  const { feed_url } = useLocalSearchParams<{ feed_url: string }>();
  const router = useRouter();
  const { data, loading, error } = useFeedContent(feed_url);
  const content = data?.rss?.channel?.item;
  const title = data?.rss?.channel?.title;
  const date = data?.date?.toString();

  const previousRoute = usePreviousRoute<{ article_url: string }>();
  const previousArticleUrl = previousRoute?.params?.article_url;

  const getRouteLink = useCallback(
    (link: string) =>
      `/feeds/${encodeURIComponent(feed_url)}/articles/${encodeURIComponent(link)}`,
    [feed_url],
  );

  // TODO: only important articles should have Hero
  const htmlItems = useMemo(() => {
    if (content?.length === 0) {
      return '<div class="no-new-conent">No new content for this feed</div>';
    }
    return (
      content
        ?.map(
          ({ title, link, author, heroImage }: FeedContentItem) => `
            <div 
              class="item ${heroImage ? "with-hero" : ""}" 
              data-route-link="${getRouteLink(link)}" 
            >
              ${heroImage ? `<div class="hero-image"><img src="${heroImage}"></img></div>` : ""}
              <h3 class="title">${title}</h3>
              ${author ? '<p class="author">' + author + "</p>" : ""}
            </div>
          `,
        )
        .join("") ?? ""
    );
  }, [content, getRouteLink]);

  // html does NOT include previousArticleUrl so the WebView source stays stable
  // on navigation back. The highlight is applied via postLoadScript instead.
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

      .item.with-hero {
        padding: ${sizes.s0_50}px 0;
      }

      .title {
        color: ${colors.text};
        font-size: ${fonts.fontSizeH4}px;
        line-height: ${fonts.lineHeightComfortable}px;
        font-weight: bold;
        margin: 0;
      }

      .author {
        color: ${colors.text};
        font-size: ${fonts.fontSizeSmall}px;
        font-style: italic;
        line-height: ${fonts.lineHeightComfortable}px;
        margin: 0;
      }

      .hero-image {
        width: 100%;
        aspect-ratio: 16 / 5;
        overflow: hidden;
        margin: 0 0  ${sizes.s0_50} 0;
      }

      .hero-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 20%;
      }

      .description {
        color: colors.text,
        font-size: ${fonts.fontSizeSmall}px;
        line-height: ${fonts.lineHeightComfortable}px;
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
  `,
    [htmlItems, colors, fonts, sizes],
  );

  // Highlight the previously read article by injecting a style after load,
  // without changing the WebView source (which would trigger a full reload).
  const postLoadScript = useMemo(() => {
    if (!previousArticleUrl) return undefined;
    const routePath = getRouteLink(previousArticleUrl);
    return `
      (function() {
        var items = document.querySelectorAll('[data-route-link]');
        items.forEach(function(el) {
          var link = el.getAttribute('data-route-link');
          if (link && link.includes(${JSON.stringify(routePath)})) {
            el.style.setProperty('border-bottom-width', '5px');
          } else {
            el.style.removeProperty('border-bottom-width');
          }
        });
      })();
      true;
    `;
  }, [previousArticleUrl, getRouteLink]);

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
                {title ?? ""}
              </Text>
              <Text
                style={style.headerSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {loading ? "Loading..." : `Updated ${formatLastRefresh(date)}`}
              </Text>
            </View>
          ),
        }}
      />

      {loading && (
        <Text style={{ color: colors.text, padding: sizes.s1 }}>
          Loading...
        </Text>
      )}

      {((!loading && !content) || error) && (
        <>
          <Text style={style.content}>
            The app has failed to get the feed list
          </Text>
          <Text style={style.contentCode}>
            content: {JSON.stringify(data, null, 4)}
          </Text>
          <Text style={style.contentCode}>error:{JSON.stringify(error)}</Text>
        </>
      )}

      {!loading && content && (
        <HTMLPagesNav
          name="feed"
          html={html}
          postLoadScript={postLoadScript}
          actions={{
            top: {
              label: "Nothing",
              action: () => null,
            },
            bottom: {
              label: "Feeds List",
              action: () => router.back(),
            },
            first: {
              label: "Feeds List",
              action: () => router.back(),
            },
            last: {
              label: "Feeds List",
              action: () => router.back(),
            },
          }}
          handleLink={({ href }: HandleLinkData) => {
            alert(`Unhandled link: ${href}`);
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
