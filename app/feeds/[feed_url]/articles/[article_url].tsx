import { articleService } from "@/services/ArticleService";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text, StyleSheet, View } from "react-native";
import { useAsyncFn } from "~/hooks/useAsyncFn";
import { HTMLPagesNav } from "@/components/HTMLPagesNav/index";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HandleLinkData } from "@/types";

export default function ArticlePage() {
  const { article_url } = useLocalSearchParams();
  const router = useRouter();
  const { styles, colors, sizes } = useStyles();

  const { data: article, loading, error } = useAsyncFn(articleService.getArticle, article_url as string);

  if (loading)
    return (
      <Text style={{ color: colors.text, padding: sizes.s1 }}>Loading...</Text>
    );

  if (!article) return null;

  if ((!loading && !article) || error)
    return <Text>The app has failed to get article content</Text>;

  const actions = {
    top: {
      label: "Nothing",
      action: () => router.back(),
    },
    bottom: {
      label: "Article List",
      action: () => router.back(),
    },
    first: {
      label: "Article List",
      action: () => router.back(),
    },
    last: {
      label: "Article List",
      action: () => router.back(),
    },
  };

  const handleLink = ({ href }: HandleLinkData) => {
    alert(`Unhandled link: ${href}`);
  };

  const getContent = () => {
    let content = `<h1 class="_title_">${article.title}</h1>`;

    if (article.byline) {
      content += `<h2 class="_author_">${article.byline}</h3>`;
    }
    content += article.content;

    return content;
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <Text style={styles.headerTitle}>{article.siteName}</Text>
              <Text
                style={styles.headerSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {article.title}
              </Text>
            </View>
          ),
        }}
      />

      <HTMLPagesNav
        name="article"
        html={getContent()}
        actions={actions}
        handleLink={handleLink}
      />
    </>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, sizes } = theme;

  const styles = StyleSheet.create({
    headerContainer: {
      flexBasis: "80%",
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      lineHeight: 18,
      height: 18,
      color: colors.text,
      overflow: "hidden",
    },
  });

  return { styles, colors, sizes };
}
