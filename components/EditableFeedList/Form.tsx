import { useThemeContext } from "@/theme/ThemeProvider";
import { Feed, NewFeed } from "@/types";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  TextStyle,
  InteractionManager,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FormProps = {
  item?: NewFeed | null;
  loading?: boolean;
  onSubmit: (feed: Feed) => void;
  onDelete: (feed: Feed) => void;
  onCancel: () => void;
};

export function Form({ item, loading, onSubmit, onDelete }: FormProps) {
  const { isNew, ...feed } = item ?? ({} as NewFeed);
  const { style, colors } = useStyles();
  const [name, setName] = useState(feed.name);
  const [url, setUrl] = useState(feed.url);
  const [lang, setLang] = useState<"es" | "en">(feed.lang);
  const [oldestArticle, setOldestArticle] = useState(feed.oldestArticle);
  const nameRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (isNew && !feed.name) {
          nameRef.current?.focus();
        } else if (feed.name && !feed.url) {
          urlRef.current?.focus();
        }
      }, 300);
    });
    return () => task.cancel();
  }, []);

  return (
    <KeyboardAvoidingView
      style={style.formContainer}
      behavior="height"
      keyboardVerticalOffset={56}
    >
      <View style={style.form}>
        <Text style={style.formPickerlabel}>Feed name</Text>
        <TextInput
          ref={nameRef}
          style={style.input}
          placeholder="Name"
          placeholderTextColor={colors.textGrey}
          value={name}
          onChangeText={setName}
          editable={!loading}
        />

        <Text style={style.formPickerlabel} numberOfLines={3}>
          Feed URL
        </Text>
        <TextInput
          ref={urlRef}
          style={style.input}
          placeholder="URL"
          placeholderTextColor={colors.textGrey}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          editable={!loading}
        />

        <View style={style.formPicker}>
          <Text style={style.formPickerlabel}>Feed language</Text>
          <Picker
            style={style.picker}
            selectedValue={lang}
            onValueChange={(itemValue) => setLang(itemValue)}
            prompt="Feed language"
            placeholder="Feed language"
            enabled={!loading}
            mode="dialog"
            dropdownIconColor={colors.text}
            dropdownIconRippleColor={colors.background}
          >
            <Picker.Item label="Spanish" value="es" style={style.pickerItem} />
            <Picker.Item label="English" value="en" style={style.pickerItem} />
          </Picker>
        </View>

        <View style={style.formPicker}>
          <Text style={style.formPickerlabel}>Articles from</Text>
          <Picker
            style={style.picker}
            selectedValue={oldestArticle}
            onValueChange={(itemValue) => setOldestArticle(itemValue)}
            prompt="Read artickes from"
            placeholder="Read artickes from"
            enabled={!loading}
            mode="dialog"
            dropdownIconColor={colors.text}
            dropdownIconRippleColor={colors.background}
          >
            <Picker.Item label="Today" value={1} style={style.pickerItem} />
            <Picker.Item label="Last Week" value={7} style={style.pickerItem} />
          </Picker>
        </View>
      </View>

      <View style={style.actions}>
        {!isNew && (
          <Pressable
            style={style.buttonTransparent}
            disabled={loading}
            onPress={() => {
              Alert.alert(
                "Delete Feed",
                `The feed "${feed.name}" will be removed`,
                [
                  { text: "Cancel" },
                  { text: "DELETE", onPress: () => onDelete(feed) },
                ],
              );
            }}
          >
            <Text style={style.buttonTransparentText}>Delete</Text>
          </Pressable>
        )}

        <Pressable
          style={style.saveButton}
          onPress={() =>
            onSubmit({
              ...feed,
              name,
              url,
              lang,
              oldestArticle,
            })
          }
          disabled={loading}
        >
          <Text style={style.buttonText}>Save Feed</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;
  const insets = useSafeAreaInsets();

  const button = {
    marginTop: sizes.s1,
    paddingVertical: sizes.s0_50,
    paddingHorizontal: sizes.s1,
    borderWidth: 2,
  };
  const buttonText: TextStyle = {
    fontSize: fonts.marginP,
    fontWeight: "bold",
    textAlign: "center",
  };

  const style = StyleSheet.create({
    formContainer: {
      flex: 1,
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: colors.background,
      paddingBottom: insets.bottom,
      padding: sizes.s1,
    },
    form: {
      display: "flex",
      flexDirection: "column",
    },
    actions: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: sizes.s2,
      gap: sizes.s1,
    },
    input: {
      fontSize: fonts.fontSizeSmall,
      borderColor: colors.borderDark,
      color: colors.text,
      borderWidth: 0,
      borderBottomWidth: 1,
      paddingHorizontal: 0,
      marginBottom: sizes.s1,
    },
    picker: {
      borderWidth: 4,
      color: colors.text,
      marginHorizontal: -8,
      marginBottom: -14,
    },
    pickerItem: {
      padding: 0,
      margin: 0,
      color: colors.text,
      backgroundColor: colors.background,
      lineHeight: sizes.s1,
    },
    formPicker: {
      display: "flex",
      flexDirection: "column",
      borderBottomColor: colors.borderDark,
      borderBottomWidth: 1,
      paddingBottom: sizes.s0_50,
      marginBottom: sizes.s1,
    },
    formPickerlabel: {
      color: colors.text,
    },
    saveButton: {
      ...button,
      backgroundColor: colors.backgroundDark,
      flex: 1,
    },
    buttonText: {
      ...buttonText,
      color: colors.backgroundDark_text,
    },
    buttonTransparent: {
      ...button,
      color: "transparent",
    },
    buttonTransparentText: {
      ...buttonText,
      color: colors.text,
    },
    buttonWithBorder: {
      ...button,
      color: "transparent",
      borderColor: colors.borderDark,
      borderWidth: 1,
    },
    buttonWithBorderText: {
      ...buttonText,
      color: colors.text,
    },
  });

  return { style, colors };
}
