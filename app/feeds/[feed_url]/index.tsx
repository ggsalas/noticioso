import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { getFeedContent } from "@/domain/getFeedContent";
import { useAsyncFn } from "~/hooks/useAsyncFn";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HandleLinkData, HandleRouterLinkData } from "@/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";

export default function FeedPage() {
  const { colors, fonts, sizes } = useStyles();
  const { feed_url } = useLocalSearchParams();
  const router = useRouter();
  const { data, loading, error } = useAsyncFn(getFeedContent, feed_url);
  const content = data?.rss?.channel?.item;
  const title = data?.rss?.channel?.title;

  const previousRoute = usePreviousRoute();
  const previousArticleUrl = (previousRoute?.params as { article_url: string })
    ?.article_url;

  const actions = {
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
  };

  const handleLink = ({ href }: HandleLinkData) => {
    alert(`Unhandled link: ${href}`);
  };

  const handleRouterLink = ({ path }: HandleRouterLinkData) => {
    router.navigate(path);
  };

  const getRouteLink = (link: string) =>
    `/feeds/${encodeURIComponent(
      feed_url as string
    )}/articles/${encodeURIComponent(link)}`;

  if (loading)
    return (
      <Text style={{ color: colors.text, padding: sizes.s1 }}>Loading...</Text>
    );

  if ((!loading && !content) || error)
    return (
      <>
        <Text>The app has failed to get the feed content</Text>
        <Text>content: {JSON.stringify(data, null, 4)}</Text>
        <Text>error:{JSON.stringify(error)}</Text>
      </>
    );

  // TODO on big screens
  // ${ description ? '<div class="description">' + description + "</div>" : "" }
  const htmlItems =
    content.length === 0
      ? '<div class="no-new-conent">No new content for this feed</div>'
      : content
          .map(
            ({ title, link, author }: any) => `
            <div 
              class="item" 
              data-route-link="${getRouteLink(link)}" 
            >
              <h3 class="title">${title}</h3>
              ${author ? '<p class="author">' + author + "</p>" : ""}
            </div>
          `
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

      .item[data-route-link*="${getRouteLink(previousArticleUrl)}"] {
        border-bottom-width: 5px;
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
  `;

  return (
    <>
      <Stack.Screen options={{ title: title }} />

      <HTMLPagesNav
        name="feed"
        html={html}
        actions={actions}
        handleLink={handleLink}
        handleRouterLink={handleRouterLink}
      />
    </>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  return { colors, fonts, sizes };
}
