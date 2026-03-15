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
import { useEffect } from "react";
import { useColorScheme, ToastAndroid } from "react-native";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { DarkTheme, DefaultTheme } from "@/constants/navigationThemes";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { FeedsProvider } from "@/providers/FeedsProvider";
import { PreviousRouteProvider } from "~/providers/PreviousRoute";
import { useShareIntent } from "expo-share-intent";
import { isWebUrl } from "@/validators/url";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
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

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

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

  if (!loaded && !error) {
    return null;
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
