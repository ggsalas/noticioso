import { useThemeContext } from "@/theme/ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { Dimensions, Pressable, StyleSheet } from "react-native";

type FloatingButton = {
  onAddItem: () => void;
  disabled?: boolean;
};

export function FloatingButton({ onAddItem, disabled }: FloatingButton) {
  const { style, colors } = useStyles();

  return (
    <Pressable
      style={style.floatingButton}
      disabled={disabled}
      onPress={onAddItem}
    >
      <MaterialIcons name="add" size={24} color={colors.backgroundDark_text} />
    </Pressable>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { width } = Dimensions.get("window");
  const { colors, sizes } = theme;

  const style = StyleSheet.create({
    floatingButton: {
      position: "absolute",
      bottom: sizes.getSizeProportial(2),
      left: width - sizes.getSizeProportial(4),
      width: sizes.getSizeProportial(3),
      height: sizes.getSizeProportial(3),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: sizes.getSizeProportial(1.5),
      backgroundColor: colors.backgroundDark,
      elevation: 9,
    },
  });

  return { style, colors };
}
