import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, Alert } from "react-native";
import { useFeedsContext } from "@/providers/FeedsProvider";
import { useThemeContext } from "@/theme/ThemeProvider";

export function ImportExportFeeds() {
  const { s } = useStyles();
  const { feeds, importFeeds } = useFeedsContext();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const json = JSON.stringify(feeds ?? [], null, 2);
      const fileUri = FileSystem.cacheDirectory + "feeds_export.json";
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Export feeds",
        UTI: "public.json",
      });
      setSuccess("✅ Feeds exported successfully!");
    } catch (e) {
      setError(`⚠️ Export failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    setSuccess(null);

    Alert.alert(
      "Import feeds",
      "This operation will remove all your current feeds and replace them with the imported ones. This action cannot be undone. Are you sure you want to continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Import",
          style: "destructive",
          onPress: () => doImport(),
        },
      ],
    );
  };

  const doImport = async () => {
    setLoading(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const uri = result.assets[0].uri;
      const json = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const ok = await importFeeds(json);
      if (ok) {
        setSuccess(
          "✅ Feeds imported successfully! Your feed list has been updated.",
        );
      }
    } catch (e) {
      setError(`⚠️ Import failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Your Data</Text>

      <View style={s.buttons}>
        <Pressable style={s.button} onPress={handleExport} disabled={loading}>
          <Text style={s.buttonText}>Export</Text>
        </Pressable>

        <Pressable style={s.button} onPress={handleImport} disabled={loading}>
          <Text style={s.buttonText}>Import</Text>
        </Pressable>
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      {success && <Text style={s.success}>{success}</Text>}
    </View>
  );
}

function useStyles() {
  const { theme } = useThemeContext();
  const { colors, fonts, sizes } = theme;

  const style = StyleSheet.create({
    container: {
      borderColor: colors.borderDark,
      padding: sizes.s2,
      gap: sizes.s1,
    },
    title: {
      color: colors.text,
      fontSize: fonts.fontSizeH1,
      fontFamily: fonts.fontFamilyBold,
      textAlign: "center",
    },
    buttons: {
      flexDirection: "row",
      gap: sizes.s1,
    },
    button: {
      flex: 1,
      backgroundColor: colors.text,
      paddingVertical: sizes.s0_50,
      paddingHorizontal: sizes.s1,
      alignItems: "center",
    },
    buttonText: {
      color: colors.backgroundDark_text,
      fontSize: fonts.fontSizeSmall,
    },
    error: {
      color: colors.text,
      fontSize: fonts.fontSizeSmall,
    },
    success: {
      color: colors.text,
      fontSize: fonts.fontSizeSmall,
      textAlign: "center",
      padding: sizes.s1,
      backgroundColor: colors.backgroundLight,
    },
  });

  return { s: style };
}
