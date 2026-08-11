import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type GestureResponderEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { WorkspaceStatusFileStatePayload } from "@getpaseo/protocol/messages";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortTimeInZone } from "@/utils/time";
import { selectStatusFileItemPresentation } from "./status-file-item-model";

/**
 * The status-file badge: a dot plus a short label, with the file's details in
 * the tooltip. Pressing it is deliberately inert (the ledger path in the file
 * points at the daemon's filesystem, which the app has no affordance to open),
 * so the press only stops short of selecting the row underneath.
 */
export function StatusFileItem({ state }: { state: WorkspaceStatusFileStatePayload }) {
  const { t } = useTranslation();
  const presentation = selectStatusFileItemPresentation(state);
  const label = t(presentation.labelKey, { time: presentation.time ?? "" });
  const nextTick = formatShortTimeInZone(state.nextTickAt, state.displayTimezone);
  const handlePressIn = useCallback((event: GestureResponderEvent) => event.stopPropagation(), []);
  let dotStyle = styles.dotOff;
  let labelStyle = styles.labelOff;
  if (state.state === "on") {
    dotStyle = styles.dotOn;
    labelStyle = styles.labelOn;
  } else if (state.state === "stale") {
    dotStyle = styles.dotStale;
    labelStyle = styles.labelStale;
  }

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger
        style={styles.item}
        accessibilityLabel={label}
        onPressIn={handlePressIn}
        testID={`workspace-status-file-${state.state}`}
      >
        <View style={[styles.dot, dotStyle]} />
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" offset={6}>
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipTitle}>{label}</Text>
          {presentation.time ? (
            <Text style={styles.tooltipDetail}>
              {t("workspace.statusFile.lastTick", { time: presentation.time })}
            </Text>
          ) : null}
          {nextTick ? (
            <Text style={styles.tooltipDetail}>
              {t("workspace.statusFile.nextTick", { time: nextTick })}
            </Text>
          ) : null}
          {state.mode ? (
            <Text style={styles.tooltipDetail}>
              {t("workspace.statusFile.mode", { mode: state.mode })}
            </Text>
          ) : null}
          {state.ticksCompleted !== null ? (
            <Text style={styles.tooltipDetail}>
              {t("workspace.statusFile.ticksCompleted", { count: state.ticksCompleted })}
            </Text>
          ) : null}
          {state.latestRound ? (
            <Text style={styles.tooltipDetail} numberOfLines={3}>
              {state.latestRound}
            </Text>
          ) : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    flexShrink: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    flexShrink: 0,
  },
  dotOn: {
    backgroundColor: theme.colors.statusSuccess,
  },
  dotStale: {
    backgroundColor: theme.colors.statusWarning,
  },
  dotOff: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  labelOn: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    flexShrink: 1,
  },
  labelStale: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    flexShrink: 1,
  },
  labelOff: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    flexShrink: 1,
  },
  tooltipContent: {
    gap: 4,
    maxWidth: 260,
  },
  tooltipTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  tooltipDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
