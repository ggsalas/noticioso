import { useThemeContext } from "@/theme/ThemeProvider";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Dimensions, Animated, View, Text } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import {
  getHorizontalNavigationPage,
  script,
} from "../../lib/horizontalNavigation";
import { Labels } from "./Labels";
import { usePanResponder } from "./usePanResponder";
import {
  HTMLPagesNavActions,
  HandleLinkData,
  HandleRouterLinkData,
  Pages,
} from "@/types";
import { PageIndicator } from "./PageIndicator";
import { getWebViewEvents } from "./webViewEvents";

type HTMLPaesNavProps = {
  name: string;
  html: string;
  actions: HTMLPagesNavActions;
  handleLink?: (data: HandleLinkData) => void;
  handleRouterLink?: (data: HandleRouterLinkData) => void;
  postLoadScript?: string;
};

export function HTMLPagesNavComponent({
  name,
  html,
  actions,
  handleLink,
  handleRouterLink,
  postLoadScript,
}: HTMLPaesNavProps) {
  const webviewRef = useRef<WebView>(null);
  const { width, height } = Dimensions.get("window");
  const { styles, theme } = useStyles(width);
  const [pages, setPages] = useState<Pages>({
    amount: 0,
    current: 0,
    scrollLeft: 0,
    isFirst: true,
    isLast: false,
  } as unknown as Pages);
  const [loadError, setLoadError] = useState(false);
  const { panResponder, pan, labelsOpacity, opacity } = usePanResponder({
    name,
    width,
    height,
    webviewRef,
  });

  const content = useMemo(
    () =>
      getHorizontalNavigationPage({
        content: html,
        width: styles.webView.width,
        theme,
      }),
    [html, styles.webView.width, theme],
  );

  // Memoize source object so the WebView only reloads when content actually changes.
  const source = useMemo(() => ({ html: content }), [content]);

  const webViewEvents = getWebViewEvents(name);
  const {
    SWIPE_NEXT,
    SWIPE_PREVIOUS,
    SWIPE_TOP,
    SWIPE_BOTTOM,
    ON_LOAD,
    ON_LOAD_ERROR,
    HANDLE_LINK,
    HANDLE_ROUTER_LINK,
    _CONSOLE_,
  } = webViewEvents;

  const handleScroll = useCallback((scrollLeft: number) => {
    webviewRef.current?.injectJavaScript(`
      document.getElementById("viewport").scrollLeft = ${scrollLeft};
      true; // required by injectJavaScript — the script must evaluate to true
    `);
  }, []);

  // Inject postLoadScript whenever it changes (e.g. highlight on navigation back)
  // without needing the WebView to reload.
  useEffect(() => {
    if (postLoadScript) {
      webviewRef.current?.injectJavaScript(postLoadScript);
    }
  }, [postLoadScript]);

  // Receives messages from JS inside page content
  const onMessage = (event: WebViewMessageEvent) => {
    const stringifyData = event.nativeEvent.data;
    const { eventName, ...data } = JSON.parse(stringifyData) ?? {};

    const handlePages = () => {
      const { viewportWidth, articleWidth } = data;
      const { scrollLeft } = pages;

      const getUpdatedScrollLeft = (): number => {
        if (eventName === SWIPE_NEXT) {
          // Prevent overflow at end
          if (!(articleWidth <= scrollLeft + viewportWidth)) {
            return scrollLeft + viewportWidth;
          }
        } else if (eventName === SWIPE_PREVIOUS) {
          // Prevent overflow at start
          if (scrollLeft !== 0) {
            return scrollLeft - viewportWidth;
          }
        }

        return pages.scrollLeft;
      };

      const updatedScrollLeft = getUpdatedScrollLeft();

      setPages(() => {
        const amount = Math.ceil(articleWidth / viewportWidth);
        const current = updatedScrollLeft / viewportWidth + 1;
        const isFirst = updatedScrollLeft === 0;
        const isLast = amount === current;

        return {
          amount,
          current,
          scrollLeft: updatedScrollLeft,
          isFirst,
          isLast,
        };
      });

      handleScroll(updatedScrollLeft);
    };

    switch (eventName) {
      case SWIPE_NEXT:
        if (pages.isLast) {
          return actions.last.action();
        } else {
          handlePages();
          return;
        }
      case SWIPE_PREVIOUS:
        if (pages.isFirst) {
          return actions.first.action();
        } else {
          handlePages();
          return;
        }
      case SWIPE_TOP:
        return actions.top && actions.top.action();
      case SWIPE_BOTTOM:
        return actions.bottom && actions.bottom.action();
      case ON_LOAD: {
        handlePages();
        // Safety net: also inject postLoadScript after a reload
        // (useEffect covers the no-reload case on navigation back)
        if (postLoadScript) {
          webviewRef.current?.injectJavaScript(postLoadScript);
        }
        return;
      }
      case ON_LOAD_ERROR:
        console.error("[HTMLPagesNav]", data.message);
        setLoadError(true);
        return;
      case HANDLE_LINK:
      case HANDLE_ROUTER_LINK:
        return handleRouterLink && handleRouterLink(data);
      case _CONSOLE_:
        return console.log(data);
      default:
        return;
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.labels, { opacity: labelsOpacity }]}>
        <Labels
          leftLabel={
            pages.isFirst && actions.first?.label
              ? actions.first.label
              : "Previous"
          }
          rightLabel={
            pages.isLast && actions.last?.label ? actions.last.label : "Next"
          }
          topLabel={actions.top && actions.top.label}
          bottomLabel={actions.bottom && actions.bottom.label}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.pan,
          {
            transform: pan.getTranslateTransform(),
            opacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <WebView
          ref={webviewRef}
          style={[styles.webView, { opacity: pages.amount > 0 ? 1 : 0 }]}
          originWhitelist={["*"]}
          source={source}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          scalesPageToFit={false}
          onMessage={onMessage}
          injectedJavaScript={script(webViewEvents)}
        />

        {loadError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Content could not be rendered.</Text>
          </View>
        )}

        <PageIndicator pages={pages} />
      </Animated.View>
    </View>
  );
}

function useStyles(windowWidth: number) {
  const { theme } = useThemeContext();
  const { sizes, colors, fonts } = theme;

  const webViewWidth = () => {
    const screenWidth = windowWidth - sizes.s1 * 2;
    const maxWidth = sizes.s1 * 30;

    return Math.min(screenWidth, maxWidth);
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundLight,
      flex: 1,
      position: "relative",
    },
    pan: {
      flex: 1,
      overflow: "hidden",
      backgroundColor: colors.background,
      elevation: 1,
      flexDirection: "column",
      alignItems: "center",
    },
    webView: {
      width: webViewWidth(),
      margin: sizes.s1,
      overflow: "hidden",
      backgroundColor: "transparent",
    },
    labels: {
      position: "absolute",
      height: "100%",
      width: "100%",
    },
    errorContainer: {
      position: "absolute",
      height: "100%",
      width: "100%",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      padding: sizes.s1,
    },
    errorText: {
      color: colors.text,
      fontSize: fonts.fontSizeP,
    },
  });

  return { styles, theme };
}

export const HTMLPagesNav = memo(HTMLPagesNavComponent);
