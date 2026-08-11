import { promises as fs } from "node:fs";
import type pino from "pino";
import { z } from "zod";
import type { WorkspaceStatusFileStatePayload } from "./messages.js";
import type { PersistedWorkspaceRecord } from "./workspace-registry.js";

/**
 * Contract (v1) for the on-disk status file an external process keeps updated.
 * Anything that fails this schema (wrong `schema`, bad JSON, missing file)
 * projects to "no badge", silently: an absent or malformed file is a normal
 * state, not an error.
 */
const StatusFileContentsSchema = z.looseObject({
  schema: z.literal(1),
  running: z.boolean(),
  lastTickAt: z.string().nullable().optional(),
  nextTickAt: z.string().nullable().optional(),
  cadenceSeconds: z.number().nullable().optional(),
  mode: z.string().nullable().optional(),
  ticksCompleted: z.number().nullable().optional(),
  roundsPlayed: z.array(z.string()).nullable().optional(),
  ledger: z.string().nullable().optional(),
  displayTimezone: z.string().nullable().optional(),
});

/**
 * `lastTickAt` counts as fresh while its age stays within this many cadences.
 * Beyond that the writer probably died without a stop-write, and rendering ON
 * would be a lie; the badge degrades to "stale" instead.
 */
const STALE_AFTER_CADENCES = 3;

export const WORKSPACE_STATUS_FILE_POLL_INTERVAL_MS = 30_000;

/**
 * Pure reduction of raw file contents to the wire payload. Kept free of any
 * filesystem or path handling so freshness is decided in exactly one testable
 * place. Returns null when the contents do not satisfy the v1 contract.
 *
 * Truth-preserving tri-state:
 * - "off": the writer said it stopped (`running: false`).
 * - "on": running and `lastTickAt` is fresh (age <= 3 * cadenceSeconds).
 * - "stale": running but the freshness proof is missing, unparsable, or too
 *   old. Never rendered as a false ON.
 */
export function parseWorkspaceStatusFile(
  contents: string,
  nowMs: number,
): WorkspaceStatusFileStatePayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    return null;
  }
  const parsed = StatusFileContentsSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const data = parsed.data;

  let state: WorkspaceStatusFileStatePayload["state"] = "off";
  if (data.running) {
    const lastTickMs = data.lastTickAt ? Date.parse(data.lastTickAt) : Number.NaN;
    const cadenceSeconds =
      typeof data.cadenceSeconds === "number" && data.cadenceSeconds > 0
        ? data.cadenceSeconds
        : null;
    const isFresh =
      Number.isFinite(lastTickMs) &&
      cadenceSeconds !== null &&
      nowMs - lastTickMs <= STALE_AFTER_CADENCES * cadenceSeconds * 1000;
    state = isFresh ? "on" : "stale";
  }

  const rounds = data.roundsPlayed ?? [];
  return {
    state,
    lastTickAt: data.lastTickAt ?? null,
    nextTickAt: data.nextTickAt ?? null,
    mode: data.mode ?? null,
    ticksCompleted: data.ticksCompleted ?? null,
    latestRound: rounds.length > 0 ? (rounds[rounds.length - 1] ?? null) : null,
    ledgerPath: data.ledger ?? null,
    displayTimezone: data.displayTimezone ?? null,
  };
}

export interface WorkspaceStatusFileObserver {
  /** Latest projection for a workspace; null means "no badge". */
  getState(workspaceId: string): WorkspaceStatusFileStatePayload | null;
  /** Re-read every configured file now and emit updates for changes. */
  poll(): Promise<void>;
  dispose(): void;
}

/**
 * Polls each workspace's configured `statusFile` and pushes the projection to
 * clients through the regular workspace-update fan-out. A plain interval poll
 * rather than an fs watcher on purpose: the file may sit on a network or WSL
 * mount where change events are unreliable, and staleness is a function of
 * wall-clock time: ON must be able to degrade to STALE without a new write,
 * which only a periodic re-evaluation provides.
 */
export function createWorkspaceStatusFileObserver(deps: {
  listWorkspaces: () => Promise<PersistedWorkspaceRecord[]>;
  emitWorkspaceUpdateForWorkspaceId: (workspaceId: string) => Promise<void>;
  logger: pino.Logger;
  readFile?: (path: string) => Promise<string>;
  pollIntervalMs?: number;
  now?: () => number;
}): WorkspaceStatusFileObserver {
  const {
    listWorkspaces,
    emitWorkspaceUpdateForWorkspaceId,
    logger,
    readFile = (path) => fs.readFile(path, "utf8"),
    pollIntervalMs = WORKSPACE_STATUS_FILE_POLL_INTERVAL_MS,
    now = () => Date.now(),
  } = deps;

  const statesByWorkspaceId = new Map<string, WorkspaceStatusFileStatePayload>();
  let disposed = false;

  async function updateWorkspaceState(
    workspaceId: string,
    next: WorkspaceStatusFileStatePayload | null,
  ): Promise<void> {
    const previous = statesByWorkspaceId.get(workspaceId) ?? null;
    if (JSON.stringify(previous) === JSON.stringify(next)) {
      return;
    }
    if (next) {
      statesByWorkspaceId.set(workspaceId, next);
    } else {
      statesByWorkspaceId.delete(workspaceId);
      // One debug line per transition; an unreadable or invalid file is a
      // normal state and must not spam the log on every poll.
      logger.debug({ workspaceId }, "Workspace status file became unreadable or invalid");
    }
    await emitWorkspaceUpdateForWorkspaceId(workspaceId);
  }

  async function poll(): Promise<void> {
    let workspaces: PersistedWorkspaceRecord[];
    try {
      workspaces = await listWorkspaces();
    } catch (error) {
      logger.debug({ err: error }, "Workspace status file poll could not list workspaces");
      return;
    }
    const configuredIds = new Set<string>();
    for (const workspace of workspaces) {
      if (disposed) return;
      if (!workspace.statusFile || workspace.archivedAt) continue;
      configuredIds.add(workspace.workspaceId);
      let next: WorkspaceStatusFileStatePayload | null = null;
      try {
        next = parseWorkspaceStatusFile(await readFile(workspace.statusFile), now());
      } catch {
        next = null;
      }
      await updateWorkspaceState(workspace.workspaceId, next);
    }
    // Copy the keys first: updateWorkspaceState(…, null) deletes from the map
    // mid-iteration.
    for (const workspaceId of Array.from(statesByWorkspaceId.keys())) {
      if (disposed) return;
      if (!configuredIds.has(workspaceId)) {
        await updateWorkspaceState(workspaceId, null);
      }
    }
  }

  const timer = setInterval(() => {
    void poll().catch((error) => {
      logger.debug({ err: error }, "Workspace status file poll failed");
    });
  }, pollIntervalMs);
  timer.unref?.();
  void poll().catch((error) => {
    logger.debug({ err: error }, "Workspace status file poll failed");
  });

  return {
    getState(workspaceId) {
      return statesByWorkspaceId.get(workspaceId) ?? null;
    },
    poll,
    dispose() {
      disposed = true;
      clearInterval(timer);
      statesByWorkspaceId.clear();
    },
  };
}
