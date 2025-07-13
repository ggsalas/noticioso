import { useEffect, useState } from "react";
import { useNavigationContainerRef } from "expo-router";

export function usePreviousRoute() {
  const navigationRef = useNavigationContainerRef();
  const [previousRoute, setPreviousRoute] = useState<string | null>(null);

  useEffect(() => {
    if (navigationRef.isReady()) {
      const unsubscribe = navigationRef.addListener("state", () => {
        const currentRoute = navigationRef.getCurrentRoute();
        const previousRoute = navigationRef.getState()?.routes[navigationRef.getState()!.routes.length - 2];

        if (currentRoute && previousRoute && currentRoute.name !== previousRoute.name) {
          setPreviousRoute(previousRoute.name);
        }
      });

      return unsubscribe;
    }
  }, [navigationRef]);

  return previousRoute;
}
