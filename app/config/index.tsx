import { Link } from "expo-router";
import { Pressable, Text, View, StyleSheet, ScrollView } from "react-native";
import { useThemeContext } from "@/theme/ThemeProvider";

export default function Index() {
  const { s, changeFontSize } = useStyles();

  return (
    <ScrollView style={s.scrollView}>
      <View style={s.main}>
        <View style={s.hero}>
          <Text style={s.heroText}>Welcome to El Noticioso</Text>

          <Link href="/feeds" asChild>
            <Pressable style={s.button}>
              <Text style={s.buttonText}>Read</Text>
            </Pressable>
          </Link>
        </View>

        <View style={s.hero}>
          <Text style={s.heroText}>Configure font size</Text>
          <Text style={s.testText}>
            This is a example of text, to adjust the height as you need
          </Text>

          <Pressable
            style={s.button}
            onPress={() => changeFontSize && changeFontSize("increase")}
          >
            <Text style={s.buttonText}>Increase</Text>
          </Pressable>
          <Pressable
            style={s.button}
            onPress={() => changeFontSize && changeFontSize("decrease")}
          >
            <Text style={s.buttonText}> Decrease </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function useStyles() {
  const { theme, changeFontSize } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    scrollView: {
      backgroundColor: colors.background,
    },
    main: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: sizes.s1,
      padding: sizes.s1,
      backgroundColor: colors.background,
    },
    hero: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: sizes.s1,
      borderColor: colors.borderDark,
      borderRadius: sizes.s0_50,
      borderWidth: 1,
      padding: sizes.s2,
    },
    heroText: {
      color: colors.text,
      fontSize: fonts.fontSizeH1,
      fontFamily: fonts.fontFamilyBold,
    },
    testText: {
      color: colors.text,
      fontSize: fonts.fontSizeP,
      fontFamily: fonts.fontFamilyRegular,
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

  return { s: style, changeFontSize };
}
