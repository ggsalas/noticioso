import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";

type NewArticlesContextType = {
  hasNewArticles: boolean;
  newArticlesCount: number;
  showNewArticlesToast: (count?: number) => void;
  dismissNewArticlesToast: () => void;
};

const NewArticlesContext = createContext<NewArticlesContextType>({
  hasNewArticles: false,
  newArticlesCount: 0,
  showNewArticlesToast: () => {},
  dismissNewArticlesToast: () => {},
});

export function NewArticlesProvider({ children }: { children: ReactNode }) {
  const [hasNewArticles, setHasNewArticles] = useState(false);
  const [newArticlesCount, setNewArticlesCount] = useState(0);

  const showNewArticlesToast = useCallback((count: number = 1) => {
    setNewArticlesCount(count);
    setHasNewArticles(true);
  }, []);

  const dismissNewArticlesToast = useCallback(() => {
    setHasNewArticles(false);
    setNewArticlesCount(0);
  }, []);

  return (
    <NewArticlesContext.Provider
      value={{
        hasNewArticles,
        newArticlesCount,
        showNewArticlesToast,
        dismissNewArticlesToast,
      }}
    >
      {children}
    </NewArticlesContext.Provider>
  );
}

export function useNewArticlesContext() {
  return useContext(NewArticlesContext);
}