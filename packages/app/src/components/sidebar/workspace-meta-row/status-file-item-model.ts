import type { WorkspaceStatusFileStatePayload } from "@getpaseo/protocol/messages";
import { formatShortTimeInZone } from "@/utils/time";

/**
 * The badge label and its formatted tick time, as data rather than markup so
 * the three states (and the no-time fallback) can be unit tested without
 * rendering. `time` is already formatted in the status file's declared
 * timezone; the state machine upstream (the daemon) never lets a dead writer
 * read as "on".
 */
export function selectStatusFileItemPresentation(state: WorkspaceStatusFileStatePayload): {
  labelKey: string;
  time: string | null;
} {
  const time = formatShortTimeInZone(state.lastTickAt, state.displayTimezone);
  if (state.state === "on") {
    return { labelKey: time ? "workspace.statusFile.onWithTick" : "workspace.statusFile.on", time };
  }
  if (state.state === "stale") {
    return { labelKey: "workspace.statusFile.stale", time };
  }
  return { labelKey: "workspace.statusFile.off", time };
}
