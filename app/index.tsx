import { Link, Redirect, Stack } from "expo-router";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useThemeContext } from "@/theme/ThemeProvider";
import { useFeedsContext } from "@/providers/FeedsProvider";

export default function Index() {
  const { style } = useStyles();
  const { feeds, loading } = useFeedsContext();

  if (!loading && feeds && feeds?.length > 0) {
    return <Redirect href="/feeds" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: "Home" }} />

      <View style={style.main}>
        {loading ? (
          <Text style={style.text}>Loading...</Text>
        ) : (
          <>
            <Text style={style.text}>
              Hi, this is &rdquo;El Noticioso&rdquo;
            </Text>

            <Link href="/searchFeedUrl" asChild>
              <Pressable style={style.button}>
                <Text style={style.buttonText}>Add your first feed</Text>
              </Pressable>
            </Link>
          </>
        )}
      </View>
    </>
  );
}

function useStyles() {
  const { theme, changeFontSize } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    main: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: sizes.s1,
      padding: sizes.s1,
      backgroundColor: colors.background,
    },
    text: {
      color: colors.text,
      fontSize: fonts.fontSizeH1,
      fontFamily: fonts.fontFamilyBold,
      marginBottom: sizes.s1 * 4,
      marginTop: sizes.s1 * -1 * 10,
    },
    button: {
      backgroundColor: colors.text,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      fontSize: fonts.baseFontSize,
    },
    buttonText: {
      color: colors.backgroundDark_text,
    },
  });

  return { style, changeFontSize };
}
