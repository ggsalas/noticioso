import { Tabs } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useThemeContext } from "@/theme/ThemeProvider";
import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme } from "~/constants/navigationThemes";

export default function TabLayout() {
  const { theme } = useThemeContext();
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textGrey,
        tabBarStyle: {
          backgroundColor:
            colorScheme === "dark"
              ? DarkTheme.colors.card
              : DefaultTheme.colors.card,
        },
      }}
    >
      <Tabs.Screen
        name="feedList"
        options={{
          title: "Handle Feeds",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="edit" size={24} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="settings" size={24} color={color} />
          ),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
