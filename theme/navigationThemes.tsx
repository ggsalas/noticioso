import type { Theme } from "@react-navigation/native";
import { colors } from "~/theme/colors";

export const DarkTheme: Theme = {
  dark: true,
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" as const },
    medium: { fontFamily: "System", fontWeight: "500" as const },
    bold: { fontFamily: "System", fontWeight: "700" as const },
    heavy: { fontFamily: "System", fontWeight: "900" as const },
  },
  colors: {
    primary: colors.dark.tint,
    background: colors.dark.backgroundLight,
    card: colors.dark.backgroundLight,
    text: colors.dark.text,
    border: colors.dark.borderDark,
    notification: colors.dark.tint,
  },
};

export const DefaultTheme: Theme = {
  dark: false,
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" as const },
    medium: { fontFamily: "System", fontWeight: "500" as const },
    bold: { fontFamily: "System", fontWeight: "700" as const },
    heavy: { fontFamily: "System", fontWeight: "900" as const },
  },
  colors: {
    primary: colors.light.tint,
    background: colors.light.backgroundLight,
    card: colors.light.backgroundLight,
    text: colors.light.text,
    border: colors.light.borderDark,
    notification: colors.light.tint,
  },
};
