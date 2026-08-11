import { describe, expect, it } from "vitest";
import type { WorkspaceStatusFileStatePayload } from "@getpaseo/protocol/messages";
import { selectStatusFileItemPresentation } from "./status-file-item-model";

function state(
  overrides: Partial<WorkspaceStatusFileStatePayload> = {},
): WorkspaceStatusFileStatePayload {
  return {
    state: "on",
    lastTickAt: "2026-08-10T21:38:00Z",
    nextTickAt: "2026-08-10T21:58:00Z",
    mode: "idle",
    ticksCompleted: 3,
    latestRound: "#1 round",
    ledgerPath: "/tmp/ledger.md",
    displayTimezone: "America/Sao_Paulo",
    ...overrides,
  };
}

describe("selectStatusFileItemPresentation", () => {
  it("labels 'on' with the last tick rendered in the file's timezone", () => {
    const presentation = selectStatusFileItemPresentation(state());
    expect(presentation.labelKey).toBe("sidebar.workspace.statusFile.onWithTick");
    // 21:38 UTC is 18:38 in America/Sao_Paulo; the exact rendering (18:38 vs
    // 6:38 PM) follows the device hour cycle, so assert on the zoned digits.
    expect(presentation.time).toMatch(/6:38|18:38/);
  });

  it("labels 'on' without a tick when the timestamp is unusable", () => {
    const presentation = selectStatusFileItemPresentation(state({ lastTickAt: "garbage" }));
    expect(presentation).toEqual({ labelKey: "sidebar.workspace.statusFile.on", time: null });
  });

  it("falls back to the device timezone for an invalid IANA name", () => {
    const presentation = selectStatusFileItemPresentation(state({ displayTimezone: "Not/AZone" }));
    expect(presentation.labelKey).toBe("sidebar.workspace.statusFile.onWithTick");
    expect(presentation.time).not.toBeNull();
  });

  it("labels 'stale' and 'off' by state", () => {
    expect(selectStatusFileItemPresentation(state({ state: "stale" })).labelKey).toBe(
      "sidebar.workspace.statusFile.stale",
    );
    expect(selectStatusFileItemPresentation(state({ state: "off" })).labelKey).toBe(
      "sidebar.workspace.statusFile.off",
    );
  });
});
