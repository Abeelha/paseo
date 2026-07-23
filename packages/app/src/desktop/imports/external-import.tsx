import { useCallback, useState } from "react";
import { Image, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { isElectronRuntimeMac } from "@/desktop/host";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import { settingsStyles } from "@/styles/settings";
import { ImportSheet, type ImportSourceDescriptor } from "./import-sheet";

export function ExternalImport({ source }: { source: ImportSourceDescriptor }) {
  const { t } = useTranslation();
  const { data } = useDaemonStatus({ refetchOnMount: false });
  const desktopManaged = data?.status.desktopManaged;
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  if (!isElectronRuntimeMac()) return null;

  const available = desktopManaged === true;
  let reason: string | null = null;
  if (desktopManaged === undefined) {
    reason = t("desktop.integrations.import.availability.checking");
  } else if (!available) {
    reason = t("desktop.integrations.import.availability.host-not-running");
  }

  return (
    <>
      <View
        style={[settingsStyles.row, settingsStyles.rowBorder]}
        testID={`${source.id}-import-row`}
      >
        <View style={settingsStyles.rowContent}>
          <View style={styles.titleRow}>
            <View style={styles.iconFrame}>
              <Image source={source.icon} style={styles.icon} resizeMode="contain" />
            </View>
            <Text style={settingsStyles.rowTitle}>{source.title}</Text>
          </View>
          <Text style={settingsStyles.rowHint}>
            {reason ?? t("desktop.integrations.import.description")}
          </Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          onPress={open}
          disabled={!available}
          testID={`${source.id}-import-open`}
        >
          {t("desktop.integrations.import.actions.import")}
        </Button>
      </View>
      <ImportSheet source={source} visible={visible} onClose={close} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  titleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  iconFrame: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    backgroundColor: "#282423",
  },
  icon: { width: 12, height: 18 },
}));
