import { useLocalSearchParams, useRouter } from "expo-router";
import { ArticleView } from "@/components/ArticleView";

export default function SharedArticlePage() {
  const { article_url } = useLocalSearchParams<{ article_url: string }>();
  const router = useRouter();

  return (
    <ArticleView
      article_url={article_url}
      actions={{
        top: { label: "", action: () => null },
        bottom: { label: "Back", action: () => router.back() },
        first: { label: "Back", action: () => router.back() },
        last: { label: "", action: () => null },
      }}
    />
  );
}
