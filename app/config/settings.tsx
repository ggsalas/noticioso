import { Pressable, Text, View, StyleSheet, ScrollView } from "react-native";
import { useThemeContext } from "@/theme/ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { ImportExportFeeds } from "@/components/ImportExportFeeds";

export default function Settings() {
  const { s, changeFontSize, sizes } = useStyles();

  return (
    <ScrollView style={s.scrollView}>
      <View style={s.main}>
        <View style={s.hero}>
          <Text style={s.heroText}>Configure Font Size</Text>
          <Text style={s.testText}>
            This is a example of text, to adjust the height as you need
          </Text>

          <View style={s.fontButtons}>
            <Pressable
              style={s.button}
              onPress={() => changeFontSize && changeFontSize("decrease")}
            >
              <MaterialIcons
                name="remove"
                size={sizes.s1}
                color={s.buttonText.color}
              />
            </Pressable>
            <Pressable
              style={s.button}
              onPress={() => changeFontSize && changeFontSize("increase")}
            >
              <MaterialIcons
                name="add"
                size={sizes.s1}
                color={s.buttonText.color}
              />
            </Pressable>
          </View>
        </View>

        <ImportExportFeeds />
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
      borderBottomWidth: 1,
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
    buttonWhite: {
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      justifyContent: "center",
      marginVertical: sizes.s1,
    },
    buttonWhiteText: {
      fontSize: fonts.fontSizeH1,
      fontFamily: fonts.fontFamilyBold,
      color: colors.text,
      textAlign: "center",
    },
    fontButtons: {
      flexDirection: "row",
      flex: 1,
      justifyContent: "space-between",
    },
  });

  return { s: style, changeFontSize, sizes };
}
