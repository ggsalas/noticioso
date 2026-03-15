import { useLocalSearchParams, useRouter } from "expo-router";
import { ArticleView } from "@/components/ArticleView";

export default function SharedArticlePage() {
  const { article_url } = useLocalSearchParams<{ article_url: string }>();
  const router = useRouter();

  return (
    <ArticleView
      article_url={article_url}
      actions={{
        top: { label: "Nothing", action: () => router.replace("/feeds") },
        bottom: { label: "Feeds", action: () => router.replace("/feeds") },
        first: { label: "Feeds", action: () => router.replace("/feeds") },
        last: { label: "Feeds", action: () => router.replace("/feeds") },
      }}
    />
  );
}
