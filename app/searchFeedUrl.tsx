import { Stack, useRouter } from "expo-router";
import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useThemeContext } from "@/theme/ThemeProvider";
import {
  feedDiscoveryService,
  DiscoveredFeed,
} from "@/services/FeedDiscoveryService";

export default function SearchFeedUrl() {
  const { style, colors } = useStyles();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveredFeed[] | null>(null);

  const lastSearchRef = useRef("");
  const inputRef = useRef<TextInput>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    lastSearchRef.current = search.trim();

    try {
      const feeds = await feedDiscoveryService.discoverFeeds(search.trim());
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
    router.push(`/editFeed?prefillName=${encodeURIComponent(search)}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Search Feeds" }} />

      <FlatList
        style={style.mainContainer}
        data={results ?? []}
        keyExtractor={(item) => item.url}
        renderItem={({ item }) => (
          <Pressable
            style={style.resultItem}
            onPress={() => handleSelectFeed(item)}
          >
            <Text style={style.resultTitle}>{item.title}</Text>
            <Text style={style.resultUrl}>{item.url}</Text>
          </Pressable>
        )}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={style.search}>
            <Text>Search content or enter a URL</Text>
            <View style={style.searchRow}>
              <TextInput
                ref={inputRef}
                style={style.input}
                placeholder="URL or search term..."
                placeholderTextColor={colors.textGrey}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                editable={!loading}
              />
              <Pressable
                style={[style.searchIcon, loading && style.searchIconDisabled]}
                onPress={
                  results !== null && search.trim() === lastSearchRef.current
                    ? () => {
                        setSearch("");
                        setResults(null);
                        setError(null);
                        inputRef.current?.focus();
                      }
                    : handleSearch
                }
                disabled={loading}
              >
                <MaterialIcons
                  name={
                    results !== null && search.trim() === lastSearchRef.current
                      ? "close"
                      : "search"
                  }
                  size={22}
                  color={colors.text}
                />
              </Pressable>
            </View>

            {loading && (
              <ActivityIndicator style={style.loading} color={colors.text} />
            )}

            {error && <Text style={style.error}>{error}</Text>}

            {results !== null && results.length === 0 && !loading && (
              <Text style={style.empty}>No feeds found.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          <Pressable
            style={[style.buttonWhite]}
            onPress={handleAddFeedManually}
          >
            <Text style={style.buttonWhiteText}>Add feed URL manually</Text>
          </Pressable>
        }
      />
    </>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    mainContainer: {
      flex: 1,
      paddingHorizontal: sizes.s1,
      backgroundColor: colors.background,
    },
    search: {
      paddingTop: sizes.s1,
      backgroundColor: colors.background,
    },
    searchRow: {
      position: "relative",
      marginBottom: sizes.s0_25,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
      flexDirection: "row",
      gap: sizes.s0_50,
    },
    input: {
      fontSize: fonts.fontSizeSmall,
      color: colors.text,
      paddingRight: sizes.s2,
      paddingHorizontal: 0,
      flex: 1,
    },
    searchIcon: {
      alignSelf: "stretch",
      flex: 0,
      flexDirection: "row",
      alignItems: "center",
      alignContent: "center",
      padding: sizes.s0_50,
      zIndex: 1,
      backgroundColor: colors.background,
    },
    searchIconDisabled: {
      opacity: 0.5,
    },
    buttonWhite: {
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      justifyContent: "center",
      marginVertical: sizes.s1,
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
