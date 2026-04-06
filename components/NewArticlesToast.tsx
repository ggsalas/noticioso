import { useEffect, useRef, useCallback } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useThemeContext } from "@/theme/ThemeProvider";

type NewArticlesToastProps = {
  visible: boolean;
  onPress: () => void;
  onDismiss: () => void;
  duration?: number;
};

export function NewArticlesToast({
  visible,
  onPress,
  onDismiss,
  duration = 0,
}: NewArticlesToastProps) {
  const { theme } = useThemeContext();
  const { colors, sizes } = theme;
  const translateY = useRef(new Animated.Value(100)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }, [translateY, onDismiss]);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();

      if (duration > 0) {
        timeoutRef.current = setTimeout(dismiss, duration);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible, duration, dismiss, translateY]);

  const handlePress = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onPress();
  }, [onPress]);

  const handleDismiss = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    dismiss();
  }, [dismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.backgroundLight,
          transform: [{ translateY }],
          bottom: sizes.s1,
          marginHorizontal: sizes.s1,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.textContainer}>
          <Text style={[styles.text, { color: colors.text }]}>
            Load new available articles
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.buttons}>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.button}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="close" size={sizes.s1} color={colors.text} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 16,
  },
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtext: {
    fontSize: 14,
    marginTop: 2,
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    gap: 8,
  },
  button: {
    padding: 4,
  },
});
