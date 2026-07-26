import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type {
  Options,
  Query,
  SpawnOptions as ClaudeSpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import * as spawnUtils from "../../../../utils/spawn.js";
import { ClaudeAgentClient } from "./agent.js";
import type { ClaudeQueryInput } from "./query.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";

function createHangingQueryMock(): Query {
  return {
    next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => undefined)),
    return: vi.fn(async () => ({ done: true, value: undefined })),
    interrupt: vi.fn(async () => undefined),
    close: vi.fn(() => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    supportedModels: vi.fn(async () => [{ value: "opus", displayName: "Opus" }]),
    supportedCommands: vi.fn(async () => []),
    rewindFiles: vi.fn(async () => ({ canRewind: true })),
    applyFlagSettings: vi.fn(async () => undefined),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as unknown as Query;
}

function createChildProcessStub(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stderr = new EventEmitter() as ChildProcess["stderr"];
  return child;
}

function spawnChildThroughOptions(options: Options | undefined): void {
  options?.spawnClaudeCodeProcess?.({
    command: "node",
    args: ["claude.js"],
    cwd: process.cwd(),
    env: {},
    signal: new AbortController().signal,
  } satisfies ClaudeSpawnOptions);
}

describe("Claude child process exit handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails the active turn when the process exits without a terminal result", async () => {
    let capturedOptions: Options | undefined;
    const queryFactory = vi.fn(({ options }: ClaudeQueryInput) => {
      capturedOptions = options;
      return createHangingQueryMock();
    });
    const child = createChildProcessStub();
    vi.spyOn(spawnUtils, "spawnProcess").mockReturnValue(child);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory,
      resolveBinary: async () => "/test/claude/bin",
    });
    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
    });

    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => {
      events.push(event);
    });

    try {
      await session.startTurn("hello");
      spawnChildThroughOptions(capturedOptions);
      child.emit("exit", 1, null);

      const hasTurnFailed = () => events.some((event) => event.type === "turn_failed");
      await vi.waitFor(
        () => {
          expect(hasTurnFailed()).toBe(true);
        },
        { timeout: 5_000, interval: 50 },
      );

      const failure = events.find(
        (event): event is Extract<AgentStreamEvent, { type: "turn_failed" }> =>
          event.type === "turn_failed",
      );
      expect(failure?.error).toContain("exited with code 1");
    } finally {
      unsubscribe();
      await session.close();
    }
  }, 15_000);

  test("relaunches the query when the cached process already exited", async () => {
    let capturedOptions: Options | undefined;
    const queryFactory = vi.fn(({ options }: ClaudeQueryInput) => {
      capturedOptions = options;
      return createHangingQueryMock();
    });
    const child = createChildProcessStub();
    vi.spyOn(spawnUtils, "spawnProcess").mockReturnValue(child);

    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory,
      resolveBinary: async () => "/test/claude/bin",
    });
    const session = await client.createSession({
      provider: "claude",
      cwd: process.cwd(),
    });

    try {
      await session.listCommands();
      spawnChildThroughOptions(capturedOptions);
      expect(queryFactory).toHaveBeenCalledTimes(1);

      Object.defineProperty(child, "exitCode", { value: 1, configurable: true });

      await session.listCommands();
      expect(queryFactory).toHaveBeenCalledTimes(2);
    } finally {
      await session.close();
    }
  }, 15_000);
});
