import { useThemeContext } from "@/theme/ThemeProvider";
import { Feed, NewFeed } from "@/types";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  TextStyle,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

type FormProps = {
  item?: NewFeed | null;
  loading?: boolean;
  onSubmit: (feed: Feed) => void;
  onDelete: (feed: Feed) => void;
  onCancel: () => void;
};

export function Form({
  item,
  loading,
  onSubmit,
  onCancel,
  onDelete,
}: FormProps) {
  const { isNew, ...feed } = item ?? ({} as NewFeed);
  const { style, colors } = useStyles();
  const [name, setName] = useState(feed.name);
  const [url, setUrl] = useState(feed.url);
  const [lang, setLang] = useState<"es" | "en">(feed.lang);
  const [oldestArticle, setOldestArticle] = useState(feed.oldestArticle);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => {
      nameRef.current?.focus();
    }, 100);
  }, []);

  return (
    <View style={style.formContainer}>
      <View style={style.form}>
        <TextInput
          ref={nameRef}
          style={style.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
          editable={!loading}
        />
        <TextInput
          style={style.input}
          placeholder="URL"
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          editable={!loading}
        />
        <View style={style.formPicker}>
          <Text style={style.formPickerlabel}>Feed language:</Text>
          <Picker
            style={style.picker}
            selectedValue={lang}
            onValueChange={(itemValue) => setLang(itemValue)}
            prompt="Feed language"
            placeholder="Feed language"
            enabled={!loading}
            mode="dropdown"
            dropdownIconColor={colors.text}
            dropdownIconRippleColor={colors.background}
          >
            <Picker.Item label="Spanish" value="es" style={style.pickerItem} />
            <Picker.Item label="English" value="en" style={style.pickerItem} />
          </Picker>
        </View>

        <View style={style.formPicker}>
          <Text style={style.formPickerlabel}>Articles from: </Text>
          <Picker
            style={style.picker}
            selectedValue={oldestArticle}
            onValueChange={(itemValue) => setOldestArticle(itemValue)}
            prompt="Read artickes from"
            placeholder="Read artickes from"
            enabled={!loading}
            mode="dropdown"
            dropdownIconColor={colors.text}
            dropdownIconRippleColor={colors.background}
          >
            <Picker.Item label="Today" value="1" style={style.pickerItem} />
            <Picker.Item label="Last Week" value="7" style={style.pickerItem} />
          </Picker>
        </View>
      </View>

      <View style={style.actions}>
        <Pressable
          style={style.button}
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

        <Pressable
          style={style.buttonWithBorder}
          onPress={onCancel}
          disabled={loading}
        >
          <Text style={style.buttonWithBorderText}>Cancel</Text>
        </Pressable>

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
                ]
              );
            }}
          >
            <Text style={style.buttonTransparentText}>Delete</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const button = {
    marginTop: sizes.s1,
    paddingVertical: sizes.s0_50,
    paddingHorizontal: sizes.s1,
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
      height: "100%",
      justifyContent: "space-between",
    },
    form: {
      display: "flex",
      flexDirection: "column",
    },
    actions: {
      display: "flex",
      flexDirection: "column",
    },
    input: {
      fontSize: fonts.fontSizeSmall,
      height: sizes.s2,
      borderColor: colors.borderDark,
      color: colors.text,
      borderWidth: 0,
      borderBottomWidth: 1,
      paddingHorizontal: 0,
    },
    picker: {
      marginHorizontal: -16,
      marginTop: -10,
      marginBottom: -16,
    },
    pickerItem: {
      padding: 0,
      margin: 0,
    },
    formPicker: {
      display: "flex",
      flexDirection: "column",
      marginTop: sizes.s0_50,
      borderBottomColor: colors.borderDark,
      borderBottomWidth: 1,
      paddingBottom: sizes.s0_50,
    },
    formPickerlabel: {
      color: colors.text,
    },
    button: {
      ...button,
      backgroundColor: colors.backgroundDark,
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
