import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { Theme, getTheme } from "./theme";
import { useColorScheme } from "react-native";
import { storageService } from "@/services/StorageService";

type ThemeContextType = {
  theme: Theme;
  changeFontSize?: (action: "increase" | "decrease") => void;
};
type Action = {
  type: "update";
  payload?: number;
};
type State = Theme;

const DEFAULT_FONT_SIZE = 16;

export const ThemeContext = createContext<ThemeContextType>({
  theme: getTheme(DEFAULT_FONT_SIZE),
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const [theme, dispatch] = useReducer(
    reducer,
    getTheme(DEFAULT_FONT_SIZE, colorScheme)
  );

  useEffect(() => {
    async function syncStore() {
      try {
        const baseFontSizeStorage = await storageService.getItem<number>(
          "@noticioso-baseFontSize"
        ) ?? DEFAULT_FONT_SIZE;

        // Storage replace current state
        if (baseFontSizeStorage !== theme.fonts.baseFontSize) {
          dispatch({ type: "update", payload: baseFontSizeStorage });
        }
      } catch (e) {
        console.error(e);
      }
    }

    syncStore();
  }, [theme.fonts.baseFontSize]);

  const changeFontSize = async (action: "increase" | "decrease") => {
    const newSize =
      action === "increase"
        ? theme.fonts.baseFontSize + 2
        : theme.fonts.baseFontSize - 2;

    try {
      await storageService.setItem(
        "@noticioso-baseFontSize",
        newSize
      );
    } catch (e) {
      console.log("error on save to storage", e);
    }

    dispatch({ type: "update", payload: newSize });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        changeFontSize,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "update":
      return getTheme(action.payload!, state.colorScheme);
    default:
      return state;
  }
}
