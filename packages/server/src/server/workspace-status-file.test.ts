import { describe, expect, it } from "vitest";
import { parseWorkspaceStatusFile } from "./workspace-status-file.js";

const NOW = Date.parse("2026-08-10T21:20:00Z");

function statusFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 1,
    running: true,
    startedAt: "2026-08-10T20:05:00Z",
    lastTickAt: "2026-08-10T21:17:00Z",
    nextTickAt: "2026-08-10T21:38:00Z",
    cadenceSeconds: 1200,
    mode: "idle",
    ticksCompleted: 3,
    roundsPlayed: ["#1 warmup round", "#2 delta re-review round"],
    note: "free text",
    ledger: "/home/user/artifacts/watchdog/2026-08-10.md",
    displayTimezone: "America/Sao_Paulo",
    ...overrides,
  });
}

describe("parseWorkspaceStatusFile", () => {
  it("projects a fresh running file to 'on' with the tooltip fields", () => {
    const state = parseWorkspaceStatusFile(statusFile(), NOW);
    expect(state).toEqual({
      state: "on",
      lastTickAt: "2026-08-10T21:17:00Z",
      nextTickAt: "2026-08-10T21:38:00Z",
      mode: "idle",
      ticksCompleted: 3,
      latestRound: "#2 delta re-review round",
      ledgerPath: "/home/user/artifacts/watchdog/2026-08-10.md",
      displayTimezone: "America/Sao_Paulo",
    });
  });

  it("degrades to 'stale' when lastTickAt is older than three cadences", () => {
    const state = parseWorkspaceStatusFile(statusFile({ lastTickAt: "2026-08-10T20:00:00Z" }), NOW);
    expect(state?.state).toBe("stale");
  });

  it("degrades to 'stale' by pure passage of time without a new write", () => {
    const contents = statusFile();
    expect(parseWorkspaceStatusFile(contents, NOW)?.state).toBe("on");
    const oneHourLater = NOW + 60 * 60 * 1000;
    expect(parseWorkspaceStatusFile(contents, oneHourLater)?.state).toBe("stale");
  });

  it("never claims 'on' without a freshness proof", () => {
    expect(parseWorkspaceStatusFile(statusFile({ lastTickAt: undefined }), NOW)?.state).toBe(
      "stale",
    );
    expect(parseWorkspaceStatusFile(statusFile({ lastTickAt: "not-a-date" }), NOW)?.state).toBe(
      "stale",
    );
    expect(parseWorkspaceStatusFile(statusFile({ cadenceSeconds: undefined }), NOW)?.state).toBe(
      "stale",
    );
    expect(parseWorkspaceStatusFile(statusFile({ cadenceSeconds: 0 }), NOW)?.state).toBe("stale");
  });

  it("projects running:false to 'off' regardless of tick age", () => {
    expect(parseWorkspaceStatusFile(statusFile({ running: false }), NOW)?.state).toBe("off");
  });

  it("returns null for bad JSON, a wrong schema version, or a missing contract", () => {
    expect(parseWorkspaceStatusFile("not json", NOW)).toBeNull();
    expect(parseWorkspaceStatusFile(statusFile({ schema: 2 }), NOW)).toBeNull();
    expect(parseWorkspaceStatusFile(JSON.stringify({ schema: 1 }), NOW)).toBeNull();
    expect(parseWorkspaceStatusFile(JSON.stringify(["schema", 1]), NOW)).toBeNull();
  });

  it("tolerates optional fields being absent", () => {
    const state = parseWorkspaceStatusFile(JSON.stringify({ schema: 1, running: false }), NOW);
    expect(state).toEqual({
      state: "off",
      lastTickAt: null,
      nextTickAt: null,
      mode: null,
      ticksCompleted: null,
      latestRound: null,
      ledgerPath: null,
      displayTimezone: null,
    });
  });
});
