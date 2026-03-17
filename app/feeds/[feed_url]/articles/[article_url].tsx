import { useLocalSearchParams, useRouter } from "expo-router";
import { ArticleView } from "@/components/ArticleView";

export default function ArticlePage() {
  const { article_url } = useLocalSearchParams<{ article_url: string }>();
  const router = useRouter();

  return (
    <ArticleView
      article_url={article_url}
      actions={{
        top: { label: "Nothing", action: () => router.back() },
        bottom: { label: "Article List", action: () => router.back() },
        first: { label: "Article List", action: () => router.back() },
        last: { label: "Article List", action: () => router.back() },
      }}
    />
  );
}
