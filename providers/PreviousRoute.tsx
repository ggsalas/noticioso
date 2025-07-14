import { useNavigationContainerRef } from "expo-router";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  NavigationState,
  ParamListBase,
  Route,
  RouteProp,
} from "@react-navigation/native";

const PreviousRouteContext = createContext<RouteProp<
  ParamListBase,
  string
> | null>(null);

export function usePreviousRoute() {
  return useContext(PreviousRouteContext);
}

function getActiveRoute(state: NavigationState): Route<string> {
  let route = state.routes[state.index];
  while (route.state) {
    route = (route.state as NavigationState).routes[
      (route.state as NavigationState).index
    ];
  }
  return route;
}

export function PreviousRouteProvider({ children }: { children: ReactNode }) {
  const navigationRef = useNavigationContainerRef();
  const [previousRoute, setPreviousRoute] = useState<RouteProp<
    ParamListBase,
    string
  > | null>(null);
  const currentRouteRef = useRef<Route<string> | null>(null);

  useEffect(() => {
    if (!navigationRef.isReady()) return;

    if (currentRouteRef.current === null) {
      const state = navigationRef.getState();
      if (state) {
        currentRouteRef.current = getActiveRoute(state);
      }
    }

    const unsubscribe = navigationRef.addListener("state", (e) => {
      const state = e.data.state;
      const newCurrentRoute = getActiveRoute(state);
      setPreviousRoute(currentRouteRef.current);
      currentRouteRef.current = newCurrentRoute;
    });

    return unsubscribe;
  }, [navigationRef]);

  return (
    <PreviousRouteContext.Provider value={previousRoute}>
      {children}
    </PreviousRouteContext.Provider>
  );
}
