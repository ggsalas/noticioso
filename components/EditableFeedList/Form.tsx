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
} from "react-native";
import { Picker } from "@react-native-picker/picker";

type FormProps = {
  item?: NewFeed | null;
  onSubmit: (feed: Feed) => void;
  onDelete: (feed: Feed) => void;
  onCancel: () => void;
};

export function Form({ item, onSubmit, onCancel, onDelete }: FormProps) {
  const { isNew, ...feed } = item ?? ({} as NewFeed);
  const { style } = useStyles(false);
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
        />
        <TextInput
          style={style.input}
          placeholder="URL"
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
        />
        <Picker
          style={style.select}
          selectedValue={lang}
          onValueChange={(itemValue) => setLang(itemValue)}
          prompt="Feed language"
          placeholder="Feed language"
          itemStyle={style.selectItem}
        >
          <Picker.Item label="Spanish" value="es" />
          <Picker.Item label="English" value="en" />
        </Picker>
        <Picker
          style={style.select}
          selectedValue={oldestArticle}
          onValueChange={(itemValue) => setOldestArticle(itemValue)}
          prompt="Read artickes from"
          placeholder="Read artickes from"
          itemStyle={style.selectItem}
        >
          <Picker.Item label="Today" value="1" />
          <Picker.Item label="Last Week" value="7" />
        </Picker>
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
        >
          <Text style={style.buttomText}>Save Feed</Text>
        </Pressable>

        <Pressable style={style.button} onPress={onCancel}>
          <Text style={style.buttomText}>Cancel</Text>
        </Pressable>

        {!isNew && (
          <Pressable
            style={style.button}
            onPress={() => {
              Alert.alert(
                "Delete Feed",
                `The feed ${item.name} will be removed`,
                [
                  { text: "Cancel", onPress: () => null },
                  { text: "DELETE", onPress: () => onDelete(item) },
                ]
              );
            }}
          >
            <Text style={style.buttomText}>Delete</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function useStyles(isActive?: boolean) {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

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
      lineHeight: sizes.s2,
      borderColor: isActive ? colors.backgroundLight : colors.borderDark,
      color: isActive ? colors.backgroundDark_text : colors.text,
      borderWidth: 0,
      borderBottomWidth: 0.5,
      paddingHorizontal: 0,
    },
    select: {
      marginHorizontal: -16,
      height: sizes.s2,
      lineHeight: sizes.s2,
      borderBottomWidth: 0.5,
      borderColor: "red",
    },
    selectItem: {
      backgroundColor: "red",
    },
    button: {
      marginTop: sizes.s1,
      backgroundColor: isActive
        ? colors.backgroundLight
        : colors.backgroundDark,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
    },
    buttomText: {
      fontSize: fonts.marginP,
      fontWeight: "bold",
      color: isActive ? colors.text : colors.backgroundDark_text,
      textAlign: "center",
    },
  });

  return { style };
}
