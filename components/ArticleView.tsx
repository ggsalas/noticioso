import { articleService } from "@/services/ArticleService";
import { Stack } from "expo-router";
import { Text, StyleSheet, View, Pressable, Share } from "react-native";
import { useAsyncFn } from "~/hooks/useAsyncFn";
import { HTMLPagesNav } from "@/components/HTMLPagesNav/index";
import { useThemeContext } from "@/theme/ThemeProvider";
import { HandleLinkData, HTMLPagesNavActions } from "@/types";
import { MaterialIcons } from "@expo/vector-icons";

type Props = {
  article_url: string;
  actions: HTMLPagesNavActions;
};

export function ArticleView({ article_url, actions }: Props) {
  const { styles, colors, sizes } = useStyles();

  const {
    data: article,
    loading,
    error,
  } = useAsyncFn(articleService.getArticle, article_url);

  const getContent = () => {
    if (!article) return "";
    let content = `<h1 class="_title_">${article.title}</h1>`;
    if (article.byline) {
      content += `<h2 class="_author_">${article.byline}</h2>`;
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
              <Text
                style={styles.headerTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {article?.siteName ?? ""}
              </Text>
              <Text
                style={styles.headerSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {article?.title ?? ""}
              </Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => Share.share({ message: article_url })}
              android_ripple={{ color: colors.textGrey, borderless: true }}
            >
              <MaterialIcons name="share" size={sizes.s1} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {loading && (
        <Text style={{ color: colors.text, padding: sizes.s1 }}>
          Loading...
        </Text>
      )}

      {error && <Text>The app has failed to get article content</Text>}

      {!loading && article && (
        <HTMLPagesNav
          name="article"
          html={getContent()}
          actions={actions}
          handleLink={({ href }: HandleLinkData) => {
            alert(`Unhandled link: ${href}`);
          }}
        />
      )}
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

  return { styles, colors, sizes };
}
