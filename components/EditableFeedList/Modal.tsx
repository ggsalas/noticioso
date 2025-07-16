import { useThemeContext } from "@/theme/ThemeProvider";
import { Feed, NewFeed } from "@/types";
import { Modal as ReactModal, StyleSheet, View } from "react-native";
import { Form } from "./Form";

type ModalProps = {
  isOpen?: boolean;
  feed?: NewFeed | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (feed: Feed) => void;
  onDelete: (feed: Feed) => void;
};

export function Modal({
  isOpen,
  onClose,
  feed,
  loading,
  onSubmit,
  onDelete,
}: ModalProps) {
  const { style } = useStyles();

  if (!isOpen) return null;

  return (
    <ReactModal
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={style.centeredView}>
        <View style={style.modalView}>
          <Form
            item={feed}
            loading={loading}
            onSubmit={onSubmit}
            onCancel={onClose}
            onDelete={onDelete}
          />
        </View>
      </View>
    </ReactModal>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, sizes } = theme;

  const style = StyleSheet.create({
    centeredView: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.backgroundTransparent,
    },
    modalView: {
      flex: 1,
      flexDirection: "column",
      width: "90%",
      margin: sizes.s2,
      borderRadius: sizes.s0_50,
      backgroundColor: colors.background,
      padding: sizes.s1,
      elevation: 5,
    },
  });

  return { style, colors };
}
