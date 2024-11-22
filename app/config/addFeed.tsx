import { View, Text } from "react-native";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { EditableFeedList } from "@/components/EditableFeedList";

export default function AddFeed() {
  const { feeds, loading, updateFeeds, addOrEditFeed, deleteFeed } =
    useFeedsContext();

  if (loading && (!feeds || feeds.length === 0)) return <Text>Loading...</Text>;

  return (
    <EditableFeedList
      feeds={feeds ?? []}
      setFeeds={updateFeeds}
      addOrEditFeed={addOrEditFeed}
      deleteFeed={deleteFeed}
    />
  );
}
