import { useThemeContext } from "@/theme/ThemeProvider";
import { Feed } from "@/types";
import { MaterialIcons } from "@expo/vector-icons";
import { Text, TouchableOpacity, StyleSheet, View } from "react-native";

type ItemProps = {
  item: Feed;
  drag: () => void;
  isActive: boolean;
  onOpenModal: (feed: Feed) => void;
};

export function Item({ item, drag, isActive, onOpenModal }: ItemProps) {
  const { style, colors } = useStyles(isActive);

  return (
    <TouchableOpacity
      style={style.container}
      onPress={() => onOpenModal(item)}
      onLongPress={drag}
    >
      <View style={style.title}>
        <Text style={style.label}>{item.name}</Text>
        <TouchableOpacity onPressIn={drag}>
          <MaterialIcons
            name="drag-indicator"
            size={24}
            color={isActive ? colors.backgroundDark_text : colors.text}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function useStyles(isActive: boolean) {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    container: {
      backgroundColor: isActive ? colors.backgroundDark : colors.background,
      flexDirection: "column",
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
      paddingHorizontal: sizes.s1,
      paddingVertical: sizes.s1,
    },
    title: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    label: {
      fontSize: fonts.fontSizeSmall,
      fontWeight: "bold",
      lineHeight: fonts.lineHeightMinimal,
      color: isActive ? colors.backgroundDark_text : colors.text,
    },
    form: {
      height: 20,
      backgroundColor: "red",
    },
  });

  return { style, colors };
}
