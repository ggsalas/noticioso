import { useEffect, useRef, useCallback } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
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
  duration = 5000,
}: NewArticlesToastProps) {
  const { theme } = useThemeContext();
  const { colors, sizes } = theme;
  const translateY = useRef(new Animated.Value(-100)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -100,
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

      timeoutRef.current = setTimeout(dismiss, duration);
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

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.backgroundLight,
          transform: [{ translateY }],
          top: sizes.s2,
          marginHorizontal: sizes.s1,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={[styles.text, { color: colors.text }]}>
          Nuevos artículos disponibles
        </Text>
        <Text style={[styles.subtext, { color: colors.textGrey }]}>
          Toca para ver
        </Text>
      </TouchableOpacity>
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
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtext: {
    fontSize: 14,
    marginTop: 2,
  },
});