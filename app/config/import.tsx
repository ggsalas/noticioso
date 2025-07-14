import {
  Pressable,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TextInputChangeEventData,
  NativeSyntheticEvent,
} from "react-native";
import { useThemeContext } from "@/theme/ThemeProvider";
import { useEffect, useState } from "react";
import { useFeedsContext } from "@/providers/FeedsProvider";

export default function Import() {
  const { s } = useStyles();
  const {
    importedFeeds,
    importError,
    loading,
    handleOnChange,
    handleOnFeedsImport,
    onBlur,
    importSuccess,
  } = useImportForm();

  return (
    <ScrollView style={s.main}>
      <TextInput
        value={importedFeeds}
        multiline={true}
        numberOfLines={20}
        textAlignVertical="top"
        onChange={handleOnChange}
        placeholder="Paste feeds data in JSON format"
        style={s.input}
        editable={!loading}
        onBlur={onBlur}
      />

      {importSuccess && <Text>Imported correctly!</Text>}
      {importError && <Text>Error: {importError}</Text>}

      <Pressable style={s.button} onPress={handleOnFeedsImport}>
        <Text style={s.buttonText}>Import</Text>
      </Pressable>
    </ScrollView>
  );
}

function useStyles() {
  const { theme, changeFontSize } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    main: {
      gap: sizes.s1,
      padding: sizes.s1,
      backgroundColor: colors.background,
    },
    button: {
      backgroundColor: colors.text,
      paddingVertical: sizes.s0_50,
      marginBottom: sizes.s2,
      paddingHorizontal: sizes.s1,
      fontSize: fonts.baseFontSize,
    },
    buttonText: {
      color: colors.backgroundDark_text,
    },
    input: {
      borderColor: colors.borderDark,
      borderWidth: 1,
      marginBottom: sizes.s0_50,
      color: colors.text,
      padding: sizes.s0_50,
    },
  });

  return { s: style, changeFontSize };
}

function useImportForm() {
  const { feeds, loading, importFeeds } = useFeedsContext();
  const [importedFeeds, setImportedFeeds] = useState<string>("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);

  useEffect(() => {
    if (!loading && feeds) {
      setImportedFeeds(JSON.stringify(feeds));
    }
  }, [loading, feeds]);

  const handleOnFeedsImport = async () => {
    try {
      await importFeeds(importedFeeds);
      setImportSuccess(true);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  const handleOnChange = (
    e: NativeSyntheticEvent<TextInputChangeEventData>
  ) => {
    setImportError("");
    setImportSuccess(false);
    setImportedFeeds(e.nativeEvent.text);
  };

  const onBlur = () => {
    setImportError("");
    setImportSuccess(false);
  };

  return {
    loading,
    importedFeeds,
    importError,
    importSuccess,
    handleOnChange,
    handleOnFeedsImport,
    onBlur,
  };
}
