import { Feed } from "@/types";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import DraggableFlatList from "react-native-draggable-flatlist";
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";
import { Item } from "./Item";
import { FloatingButton } from "./FloatingButton";
import { View, Text, StyleSheet } from "react-native";
import { useThemeContext } from "~/theme/ThemeProvider";

type EditableFeedListProps = {
  feeds: Feed[];
  setFeeds: (feeds: Feed[]) => Promise<boolean | undefined>;
  onAddItem: () => void;
  onEditItem: (feed: Feed) => void;
};

export const EditableFeedList = ({
  feeds,
  setFeeds,
  onAddItem,
  onEditItem,
}: EditableFeedListProps) => {
  const [localFeeds, setLocalFeeds] = useOptimistic(feeds);
  const listRef = useRef<FlatList<Feed>>(null);
  const { styles } = useStyles();

  return (
    <>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {feeds.length === 0 ? (
          <>
            <Text style={styles.text}>No Feeds Found.</Text>
            <Text style={styles.text}>
              Click plus (+) button to add your first feed
            </Text>
          </>
        ) : (
          <DraggableFlatList
            ref={listRef}
            scrollEnabled
            scrollToOverflowEnabled
            showsHorizontalScrollIndicator
            data={localFeeds}
            renderItem={(props) => (
              <Item {...{ ...props, onOpenModal: onEditItem }} />
            )}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => {
              setLocalFeeds(data);
              setFeeds(data);
            }}
          />
        )}
      </GestureHandlerRootView>

      <View>
        <FloatingButton onAddItem={onAddItem} />
      </View>
    </>
  );
};

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, sizes, fonts } = theme;

  const styles = StyleSheet.create({
    text: {
      color: colors.text,
      paddingTop: sizes.s1,
      paddingHorizontal: sizes.s1,
      fontFamily: fonts.fontFamilyRegular,
      fontSize: fonts.fontSizeP,
    },
  });

  return { styles };
}

function useOptimistic(
  feeds: Feed[],
): [Feed[], Dispatch<SetStateAction<Feed[]>>] {
  const [localFeeds, setLocalFeeds] = useState<Feed[]>(feeds);

  useEffect(() => {
    setLocalFeeds(feeds);
  }, [feeds]);

  return [localFeeds, setLocalFeeds];
}
