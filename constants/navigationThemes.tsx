import { Theme } from "@react-navigation/native/src/types";
import { colors } from "~/theme/colors";

export const DarkTheme: Theme = {
  dark: true,
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
  colors: {
    primary: colors.light.tint,
    background: colors.light.backgroundLight,
    card: colors.light.backgroundLight,
    text: colors.light.text,
    border: colors.light.borderDark,
    notification: colors.light.tint,
  },
};
