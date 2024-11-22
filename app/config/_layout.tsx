import { Tabs } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useThemeContext } from "@/theme/ThemeProvider";

export default function TabLayout() {
  const { theme } = useThemeContext();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textGrey,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="settings" size={24} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="addFeed"
        options={{
          title: "Handle Feeds",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="edit" size={24} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          title: "Import Feeds",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="file-copy" size={24} color={color} />
          ),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
