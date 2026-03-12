import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { EditableFeedList } from "@/components/EditableFeedList";
import { Feed } from "@/types";

export default function FeedList() {
  const { feeds, loading, updateFeeds } = useFeedsContext();
  const router = useRouter();

  if (loading && (!feeds || feeds.length === 0)) return <Text>Loading...</Text>;

  return (
    <EditableFeedList
      feeds={feeds ?? []}
      setFeeds={updateFeeds}
      onAddItem={() => router.push("/searchFeedUrl")}
      onEditItem={(feed: Feed) => router.push(`/editFeed?id=${feed.id}`)}
    />
  );
}
