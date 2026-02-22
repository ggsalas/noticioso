import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { Form } from "@/components/EditableFeedList/Form";
import { Feed, NewFeed } from "@/types";

export default function FeedFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const router = useRouter();
  const { feeds, loading, addOrEditFeed, deleteFeed } = useFeedsContext();

  const feed: NewFeed | null = isNew
    ? {
        id: Date.now().toString(),
        lang: "es",
        name: "",
        url: "",
        oldestArticle: 1,
        isNew: true,
      }
    : ((feeds?.find((f) => f.id === id) as NewFeed) ?? null);

  if (!feed) return <Text>Feed not found</Text>;

  const goBack = () => router.back();

  const onSubmit = async (updatedFeed: Feed) => {
    const succeed = await addOrEditFeed(updatedFeed);
    if (succeed) goBack();
  };

  const onDelete = async (feedToDelete: Feed) => {
    const succeed = await deleteFeed(feedToDelete);
    if (succeed) goBack();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isNew ? "New Feed" : "Edit Feed",
          headerShown: true,
        }}
      />
      <Form
        item={feed}
        loading={Boolean(loading)}
        onSubmit={onSubmit}
        onCancel={goBack}
        onDelete={onDelete}
      />
    </>
  );
}
