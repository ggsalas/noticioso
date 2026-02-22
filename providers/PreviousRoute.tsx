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
  PartialState,
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

function getActiveRoute(
  state: NavigationState | PartialState<NavigationState>,
): Route<string> | undefined {
  let route = state.routes[state.index ?? 0];
  while (route?.state) {
    const nestedState = route.state as
      | NavigationState
      | PartialState<NavigationState>;
    route = nestedState.routes[nestedState.index ?? 0];
  }
  return route as Route<string> | undefined;
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
        currentRouteRef.current = getActiveRoute(state) ?? null;
      }
    }

    const unsubscribe = navigationRef.addListener("state", (e) => {
      const state = e.data.state;
      if (!state) return;

      const newCurrentRoute = getActiveRoute(state) ?? null;
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
