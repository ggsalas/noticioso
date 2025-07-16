import { Feed, NewFeed } from "@/types";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import DraggableFlatList from "react-native-draggable-flatlist";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Item } from "./Item";
import { FloatingButton } from "./FloatingButton";
import { View, Text } from "react-native";
import { Modal } from "./Modal";

type EditableFeedList = {
  feeds: Feed[];
  loading: boolean;
  setFeeds: (feeds: Feed[]) => Promise<boolean | undefined>;
  addOrEditFeed: (feed: Feed) => Promise<boolean | undefined>;
  deleteFeed: (feed: Feed) => Promise<boolean | undefined>;
};

export const EditableFeedList = ({
  feeds,
  loading,
  setFeeds,
  addOrEditFeed,
  deleteFeed,
}: EditableFeedList) => {
  // To avoid swipe back the elements while waiting store response
  const [localFeeds, setLocalFeeds] = useOptimistic(feeds);
  const listRef = useRef<FlatList<Feed>>(null);
  const [openModal, setOpenModal] = useState<NewFeed | null>();

  const onSubmitItem = async (feed: Feed) => {
    const succeed = await addOrEditFeed(feed);
    if (succeed) {
      setOpenModal(null);
    }
  };

  const onDeleteItem = async (feed: Feed) => {
    const succeed = await deleteFeed(feed);
    if (succeed) {
      setOpenModal(null);
    }
  };

  const handleAddFeeds = () => {
    setOpenModal({
      id: Date.now().toString(),
      lang: "es",
      name: "",
      url: "",
      oldestArticle: 1,
      isNew: true,
    });
  };

  const onOpenModal = (feed: Feed) => setOpenModal(feed);

  return (
    <>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {feeds.length === 0 ? (
          <Text>No feeds has been added</Text>
        ) : (
          <DraggableFlatList
            ref={listRef}
            scrollEnabled
            scrollToOverflowEnabled
            showsHorizontalScrollIndicator
            data={localFeeds}
            renderItem={(props) => <Item {...{ ...props, onOpenModal }} />}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => {
              setLocalFeeds(data);
              setFeeds(data);
            }}
          />
        )}
      </GestureHandlerRootView>

      <View>
        <FloatingButton onAddItem={handleAddFeeds} />
        <Modal
          isOpen={Boolean(openModal)}
          onClose={() => setOpenModal(null)}
          feed={openModal}
          onSubmit={onSubmitItem}
          onDelete={onDeleteItem}
          loading={loading}
        />
      </View>
    </>
  );
};

function useOptimistic(
  feeds: Feed[]
): [Feed[], Dispatch<SetStateAction<Feed[]>>] {
  const [localFeeds, setLocalFeeds] = useState<Feed[]>(feeds);

  useEffect(() => {
    setLocalFeeds(feeds);
  }, [feeds]);

  return [localFeeds, setLocalFeeds];
}
