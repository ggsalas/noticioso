import { ColorSchemeName } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export type Colors = {
  text: string;
  textGrey: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  borderDark: string;
  backgroundDark: string;
  backgroundLight: string;
  backgroundDark_text: string;
  backgroundTransparent: string;
};

export const colors = {
  light: {
    text: "#000000",
    textGrey: "#999",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    borderDark: "#000000",
    backgroundDark: "#000000",
    backgroundLight: "#fafafa",
    backgroundDark_text: "#ffffff",
    backgroundTransparent: "#ffffffB3",
  },
  dark: {
    text: "#ffffff",
    textGrey: "#adadad",
    background: "#000000",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    borderDark: "#ffffff",
    backgroundDark: "#ffffff",
    backgroundLight: "#111111",
    backgroundDark_text: "#000000",
    backgroundTransparent: "#000000B3",
  },
};

export function getColors(themeColor: ColorSchemeName): Colors {
  return themeColor === "dark" ? colors.dark : colors.light;
}
