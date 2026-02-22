import { RefObject, useRef } from "react";
import { Animated, PanResponder } from "react-native";
import WebView from "react-native-webview";
import { getWebViewEvents } from "./webViewEvents";

type UseAnimationsParams = {
  name: string;
  width: number;
  height: number;
  webviewRef: RefObject<WebView | null>;
};

type Direction = "HORIZONTAL" | "VERTICAL" | null;
const LOAD_TIME = 50;
const OPACITY_TRANSITION = 0; // only affects the background

export function usePanResponder({
  name,
  width,
  height,
  webviewRef,
}: UseAnimationsParams) {
  const pan = useRef(new Animated.ValueXY()).current;
  const directionLocked = useRef<Direction>(null);
  const opaqueLoader = useRef(new Animated.Value(1)).current;
  const isAnimating = useRef(false);

  const opacity = useRef(new Animated.Value(1)).current;
  const labelsOpacity = useRef(new Animated.Value(0)).current;

  const { SWIPE_PREVIOUS, SWIPE_NEXT, SWIPE_BOTTOM, SWIPE_TOP } =
    getWebViewEvents(name);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        return Math.abs(gestureState.dx) > 20 || Math.abs(gestureState.dy) > 20;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const { dx, dy } = gestureState;

        // Lock direction based on initial movement
        if (directionLocked.current === null) {
          if (Math.abs(dx) > Math.abs(dy)) {
            directionLocked.current = "HORIZONTAL";
            pan.setValue({ x: dx, y: 0 });
          } else {
            directionLocked.current = "VERTICAL";
            pan.setValue({ x: 0, y: dy });
          }
        } else if (
          directionLocked.current === "HORIZONTAL" &&
          Math.abs(dy) > Math.abs(dx)
        ) {
          // Allow switching to vertical if dy is greater than dx
          directionLocked.current = "VERTICAL";
          pan.setValue({ x: 0, y: dy });
        } else if (
          directionLocked.current === "VERTICAL" &&
          Math.abs(dx) > Math.abs(dy)
        ) {
          // Allow switching to horizontal if dx is greater than dy
          directionLocked.current = "HORIZONTAL";
          pan.setValue({ x: dx, y: 0 });
        } else {
          // Continue moving in the locked direction
          if (directionLocked.current === "HORIZONTAL") {
            pan.setValue({ x: dx, y: 0 });
          } else if (directionLocked.current === "VERTICAL") {
            pan.setValue({ x: 0, y: dy });
          }
        }
      },
      onPanResponderGrant: () => {
        // Reset position and direction lock when gesture starts
        pan.setValue({ x: 0, y: 0 });
        directionLocked.current = null;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const activateSize = width / 12;

        if (isAnimating.current) return;

        isAnimating.current = true;

        if (
          directionLocked.current === "HORIZONTAL" &&
          Math.abs(gestureState.dx) > activateSize
        ) {
          const direction = gestureState.dx > 0 ? SWIPE_PREVIOUS : SWIPE_NEXT;

          // Animate labels opacity to 0 on release
          Animated.timing(labelsOpacity, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }).start();

          // Swiped sufficiently left or right
          Animated.timing(pan, {
            toValue: {
              x: direction === SWIPE_PREVIOUS ? width : -1 * width,
              y: 0,
            }, // Move off-screen
            delay: 0,
            duration: 90,
            useNativeDriver: true,
          }).start(() => {
            // Send a message to the WebView during the release phase
            webviewRef.current?.postMessage(direction);

            // Disappear content
            Animated.timing(opacity, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }).start();

            // Return to original position
            Animated.timing(pan, {
              toValue: { x: 0, y: 0 },
              duration: 0,
              useNativeDriver: true,
            }).start(() => {
              // Reappear content
              Animated.timing(opacity, {
                toValue: 1,
                duration: OPACITY_TRANSITION,
                delay: LOAD_TIME,
                useNativeDriver: true,
              }).start(() => {
                // Restore labels opacity
                Animated.timing(labelsOpacity, {
                  toValue: 1,
                  duration: 10,
                  delay: 0,
                  useNativeDriver: true,
                }).start();
              });

              directionLocked.current = null;
              isAnimating.current = false;
            });
          });
        } else if (
          directionLocked.current === "VERTICAL" &&
          Math.abs(gestureState.dy) > activateSize
        ) {
          const direction = gestureState.dy > 0 ? SWIPE_TOP : SWIPE_BOTTOM;

          // Animate labels opacity to 0 on release
          Animated.timing(labelsOpacity, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }).start();

          // Swiped sufficiently left or right
          Animated.timing(pan, {
            toValue: {
              x: 0,
              y: direction === SWIPE_TOP ? height : -1 * height,
            }, // Move off-screen
            delay: 0,
            duration: 90,
            useNativeDriver: true,
          }).start(() => {
            // Send a message to the WebView during the release phase
            webviewRef.current?.postMessage(direction);

            // Return to original position
            Animated.timing(pan, {
              toValue: { x: 0, y: 0 },
              duration: 1,
              delay: 20,
              useNativeDriver: true,
            }).start(() => {
              // Restore labels opacity
              Animated.timing(labelsOpacity, {
                toValue: 1,
                duration: 10,
                delay: 0,
                useNativeDriver: true,
              }).start();

              directionLocked.current = null;
              isAnimating.current = false;
            });
          });
        } else {
          // Reset if not swiped enough
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();

          directionLocked.current = null;
          isAnimating.current = false;
        }
      },
    }),
  ).current;

  return { panResponder, pan, labelsOpacity, opaqueLoader, opacity };
}
