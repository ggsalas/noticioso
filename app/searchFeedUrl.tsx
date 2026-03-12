import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useThemeContext } from "@/theme/ThemeProvider";
import {
  feedDiscoveryService,
  DiscoveredFeed,
} from "@/services/FeedDiscoveryService";

export default function SearchFeedUrl() {
  const { style, colors } = useStyles();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveredFeed[] | null>(null);

  const handleSearch = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const feeds = await feedDiscoveryService.discoverFeeds(url.trim());
      setResults(feeds);
    } catch (err) {
      setError(`Could not find feeds: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFeed = (feed: DiscoveredFeed) => {
    router.push(
      `/editFeed?prefillUrl=${encodeURIComponent(feed.url)}&prefillName=${encodeURIComponent(feed.title)}`,
    );
  };

  const handleAddFeedManually = () => {
    router.push(`/editFeed?prefillUrl=${encodeURIComponent(url.trim())}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Search Feed URL" }} />
      <View style={style.container}>
        <Text>Search feeds by website URL</Text>
        <View style={style.searchRow}>
          <TextInput
            style={style.input}
            placeholder="example.com"
            placeholderTextColor={colors.textGrey}
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            editable={!loading}
          />
          <Pressable
            style={[style.button, loading && style.buttonDisabled]}
            onPress={handleSearch}
            disabled={loading}
          >
            <Text style={style.buttonText}>Search</Text>
          </Pressable>
        </View>

        {loading && (
          <ActivityIndicator style={style.loading} color={colors.text} />
        )}

        {error && <Text style={style.error}>{error}</Text>}

        {results !== null && results.length === 0 && !loading && (
          <Text style={style.empty}>No feeds found for this URL.</Text>
        )}

        {results && results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={(item) => item.url}
            renderItem={({ item }) => (
              <Pressable
                style={style.resultItem}
                onPress={() => handleSelectFeed(item)}
              >
                <Text style={style.resultTitle}>{item.title}</Text>
                <Text style={style.resultUrl} numberOfLines={3}>
                  {item.url}
                </Text>
              </Pressable>
            )}
          />
        )}

        <Pressable style={[style.buttonWhite]} onPress={handleAddFeedManually}>
          <Text style={style.buttonWhiteText}>
            Or add your feed url yourself
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: sizes.s1,
    },
    searchRow: {
      flexDirection: "row",
      gap: sizes.s0_50,
      marginBottom: sizes.s1,
    },
    input: {
      flex: 1,
      fontSize: fonts.fontSizeSmall,
      borderColor: colors.borderDark,
      color: colors.text,
      borderWidth: 0,
      borderBottomWidth: 1,
      paddingHorizontal: 0,
    },
    button: {
      backgroundColor: colors.backgroundDark,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      borderWidth: 2,
      justifyContent: "center",
    },
    buttonWhite: {
      backgroundColor: colors.backgroundLight,
      borderColor: colors.backgroundDark,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      borderWidth: 2,
      justifyContent: "center",
      marginVertical: sizes.s1,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: fonts.marginP,
      fontWeight: "bold",
      color: colors.backgroundDark_text,
      textAlign: "center",
    },
    buttonWhiteText: {
      fontSize: fonts.marginP,
      fontWeight: "bold",
      color: colors.text,
      textAlign: "center",
    },
    loading: {
      marginTop: sizes.s1,
    },
    error: {
      color: colors.text,
      marginTop: sizes.s1,
    },
    empty: {
      color: colors.textGrey,
      marginTop: sizes.s1,
    },
    resultItem: {
      paddingVertical: sizes.s0_50,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
    },
    resultTitle: {
      fontSize: fonts.fontSizeSmall,
      fontWeight: "bold",
      color: colors.text,
    },
    resultUrl: {
      fontSize: fonts.fontSizeSmall,
      color: colors.textGrey,
    },
  });

  return { style, colors };
}
