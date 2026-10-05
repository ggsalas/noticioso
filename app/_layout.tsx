import "react-native-gesture-handler";

import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack, useRouter } from "expo-router";
import {
  Alegreya_500Medium,
  Alegreya_500Medium_Italic,
  Alegreya_700Bold,
  Alegreya_700Bold_Italic,
} from "@expo-google-fonts/alegreya";
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_500Medium_Italic,
  JetBrainsMono_700Bold,
  JetBrainsMono_700Bold_Italic,
} from "@expo-google-fonts/jetbrains-mono";
import { useEffect, useState } from "react";
import { useColorScheme, ToastAndroid, View, Text, TouchableOpacity } from "react-native";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { DarkTheme, DefaultTheme } from "@/constants/navigationThemes";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { FeedsProvider } from "@/providers/FeedsProvider";
import { PreviousRouteProvider } from "~/providers/PreviousRoute";
import { useShareIntent } from "expo-share-intent";
import { isWebUrl } from "@/validators/url";
import { initializeDatabase } from "@/infrastructure/initializer";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const [loaded, error] = useFonts({
    Alegreya_500Medium,
    Alegreya_500Medium_Italic,
    Alegreya_700Bold,
    Alegreya_700Bold_Italic,
    JetBrainsMono_500Medium,
    JetBrainsMono_500Medium_Italic,
    JetBrainsMono_700Bold,
    JetBrainsMono_700Bold_Italic,
  });

  // Initialize database and run migrations before FeedsProvider reads caches.
  useEffect(() => {
    initializeDatabase()
      .then(() => setDbReady(true))
      .catch((err) => setDbError(err as Error));
  }, []);

  useEffect(() => {
    if ((loaded || error) && (dbReady || dbError)) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, dbReady, dbError]);

  // Handle share intents when the app is opened via the share menu.
  useEffect(() => {
    if (!hasShareIntent) return;
    const raw = shareIntent.webUrl ?? shareIntent.text ?? null;

    try {
      if (!raw || !isWebUrl(raw)) throw new Error();
      router.replace(`/shared/${encodeURIComponent(raw)}` as never);
    } catch {
      ToastAndroid.show("Only web URLs can be shared", ToastAndroid.SHORT);
    } finally {
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, router, resetShareIntent]);

  if ((!loaded && !error) || (!dbReady && !dbError)) {
    return null;
  }

  // Show error state if database initialization failed - don't mount providers
  if (dbError) {
    return (
      <ThemeProvider>
        <NavigationThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor:
                colorScheme === "dark"
                  ? DarkTheme.colors.background
                  : DefaultTheme.colors.background,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                marginBottom: 10,
                color:
                  colorScheme === "dark"
                    ? DarkTheme.colors.text
                    : DefaultTheme.colors.text,
              }}
            >
              Database initialization failed
            </Text>
            <Text
              style={{
                fontSize: 14,
                textAlign: "center",
                marginBottom: 20,
                color:
                  colorScheme === "dark"
                    ? DarkTheme.colors.text
                    : DefaultTheme.colors.text,
                opacity: 0.7,
              }}
            >
              {dbError.message || "An unknown error occurred"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setDbError(null);
                setDbReady(false);
                initializeDatabase()
                  .then(() => setDbReady(true))
                  .catch((err) => setDbError(err as Error));
              }}
              style={{
                backgroundColor:
                  colorScheme === "dark"
                    ? DarkTheme.colors.card
                    : DefaultTheme.colors.card,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 5,
              }}
            >
              <Text
                style={{
                  color:
                    colorScheme === "dark"
                      ? DarkTheme.colors.text
                      : DefaultTheme.colors.text,
                  fontSize: 16,
                }}
              >
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        </NavigationThemeProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <NavigationThemeProvider
        value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
      >
        <PreviousRouteProvider>
          <FeedsProvider>
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor:
                    colorScheme === "dark"
                      ? DarkTheme.colors.card
                      : DefaultTheme.colors.card,
                },
                headerTintColor:
                  colorScheme === "dark"
                    ? DarkTheme.colors.text
                    : DefaultTheme.colors.text,
                contentStyle: {
                  backgroundColor:
                    colorScheme === "dark"
                      ? DarkTheme.colors.background
                      : DefaultTheme.colors.background,
                },
              }}
            >
              <Stack.Screen name="index" options={{ title: "Home" }} />
              <Stack.Screen name="+not-found" />
              <Stack.Screen name="config" options={{ title: "Settings" }} />
              <Stack.Screen name="editFeed" />
              <Stack.Screen name="searchFeedUrl" />
            </Stack>
          </FeedsProvider>
        </PreviousRouteProvider>
      </NavigationThemeProvider>
      <StatusBar
        style={colorScheme === "dark" ? "light" : "dark"}
        translucent={false}
        backgroundColor={
          colorScheme === "dark"
            ? DarkTheme.colors.card
            : DefaultTheme.colors.card
        }
      />
    </ThemeProvider>
  );
}
