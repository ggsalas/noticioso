import { Link, Stack, useRouter } from "expo-router";
import { Pressable, Text, StyleSheet } from "react-native";
import { useState } from "react";
import { HandleRouterLinkData } from "@/types";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HTMLPagesNav } from "@/components/HTMLPagesNav";
import { usePreviousRoute } from "~/providers/PreviousRoute";
import { useFeedsContext } from "@/providers/FeedsProvider";

export default function Feeds() {
  const { colors, fonts, sizes, style } = useStyles();
  const { feeds, loading, error } = useFeedsContext();
  const router = useRouter();
  const [resetNavigation, setResetNavigation] = useState(1);

  const previousRoute = usePreviousRoute();
  const previousArticleUrl = (previousRoute?.params as { feed_url: string })
    ?.feed_url;

  const getRouteLink = (link: string) => `/feeds/${encodeURIComponent(link)}`;

  const actions = {
    top: {
      label: "Nothing",
      action: () => null,
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
  };

  const handleRouterLink = ({ path }: HandleRouterLinkData) => {
    router.navigate(path);
  };

  const htmlItems =
    feeds?.length === 0
      ? '<div class="no-new-conent">No feeds found</div>'
      : feeds
          ?.map(
            ({ name, url }: any) => `
            <div 
              class="item" 
              data-route-link="${getRouteLink(url)}" 
            >
              <h3 class="title">${name}</h3>
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

  if (loading) {
    return (
      <Text style={{ color: colors.text, padding: sizes.s1 }}>Loading...</Text>
    );
  }

  if ((!loading && !feeds) || error) {
    return (
      <>
        <Text>The app has failed to get the feed list</Text>
        <Text>content: {JSON.stringify(feeds, null, 4)}</Text>
        <Text>error:{JSON.stringify(error)}</Text>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Feeds",
          headerRight: () => (
            <Link href="/config" asChild>
              <Pressable style={style.rightButton}>
                <Text style={style.rightButtonText}>Config</Text>
              </Pressable>
            </Link>
          ),
        }}
      />

      <HTMLPagesNav
        key={resetNavigation}
        name="feed"
        html={html}
        actions={actions}
        handleRouterLink={handleRouterLink}
      />
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
  });

  return { colors, fonts, sizes, style };
}
