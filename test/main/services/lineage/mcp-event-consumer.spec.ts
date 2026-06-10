import { existsSync } from "fs";
import { promises as fs } from "fs";
import type { FSWatcher } from "fs";
import { join } from "path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "@main/bootstrap/lifecycle";
import { mcpEventsDir } from "@main/infra/storage/project-paths";
import type { McpProposalEvent } from "@shared/types/mcp-event";
import { createTestTempRoot } from "@test/main/test-temp-root";

const mocks = vi.hoisted(() => ({
  disposable: null as Disposable | null,
  registerDisposable: vi.fn((disposable: Disposable) => {
    mocks.disposable = disposable;
  }),
  recordProposal: vi.fn(),
  ensureChatSubject: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  watch: vi.fn(),
  watchCallbacks: [] as WatchCallback[],
  watcherCloseFns: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    watch: mocks.watch,
  };
});

vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: mocks.registerDisposable,
}));

vi.mock("@main/services/lineage/lineage-service", () => ({
  recordProposal: mocks.recordProposal,
  ensureChatSubject: mocks.ensureChatSubject,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

import { ensureLineageEventConsumer } from "@main/services/lineage/mcp-event-consumer";

type WatchCallback = () => void;

function proposalEvent(overrides: Partial<McpProposalEvent> = {}): McpProposalEvent {
  return {
    server: "fyllo-specs",
    tool: "create-proposal",
    createdAt: "2026-06-10T00:00:00.000Z",
    sessionId: "session-1",
    changeId: "change-1",
    ...overrides,
  };
}

async function writeEventFile(
  projectPath: string,
  fileName: string,
  event: McpProposalEvent | string
): Promise<string> {
  const eventDir = mcpEventsDir(projectPath);
  await fs.mkdir(eventDir, { recursive: true });
  const filePath = join(eventDir, fileName);
  await fs.writeFile(filePath, typeof event === "string" ? event : JSON.stringify(event), "utf8");
  return filePath;
}

describe("lineage mcp event consumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchCallbacks = [];
    mocks.watcherCloseFns = [];
    mocks.recordProposal.mockResolvedValue({ id: "subject-1" });
    mocks.ensureChatSubject.mockResolvedValue({ id: "chat-subject" });
    mocks.watch.mockImplementation(((_path, listener) => {
      const close = vi.fn();
      mocks.watcherCloseFns.push(close);
      if (typeof listener === "function") {
        mocks.watchCallbacks.push(() => listener("rename", "event.json"));
      }
      return {
        close,
        on: vi.fn().mockReturnThis(),
      } as unknown as FSWatcher;
    }) as typeof import("fs").watch);
  });

  afterEach(() => {
    mocks.disposable?.dispose();
  });

  it("creates one watcher for repeated ensure calls on the same project", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-idempotent-");

    ensureLineageEventConsumer(projectPath);
    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(mocks.watch).toHaveBeenCalledTimes(1);
    });
  });

  it("consumes residual task-origin events on startup without chat fallback", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-task-");
    const filePath = await writeEventFile(projectPath, "event.json", proposalEvent());

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", "change-1");
    expect(mocks.ensureChatSubject).not.toHaveBeenCalled();
  });

  it("creates a chat subject and retries when recordProposal returns null", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-chat-");
    const filePath = await writeEventFile(projectPath, "event.json", proposalEvent());
    mocks.recordProposal.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "chat-subject" });

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.ensureChatSubject).toHaveBeenCalledWith(projectPath, "session-1");
    expect(mocks.recordProposal).toHaveBeenCalledTimes(2);
  });

  it("skips damaged files while consuming valid files in the same scan", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-damaged-");
    const damagedPath = await writeEventFile(projectPath, "bad.json", "{not-json");
    const validPath = await writeEventFile(
      projectPath,
      "good.json",
      proposalEvent({ changeId: "change-good" })
    );

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(validPath)).toBe(false);
    });
    expect(existsSync(damagedPath)).toBe(true);
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", "change-good");
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it("rescans the full directory when fs.watch emits an event", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-watch-");

    ensureLineageEventConsumer(projectPath);
    await vi.waitFor(() => {
      expect(mocks.watchCallbacks).toHaveLength(1);
    });

    const filePath = await writeEventFile(
      projectPath,
      "late.json",
      proposalEvent({ changeId: "change-late" })
    );
    mocks.watchCallbacks[0]!();

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", "change-late");
  });

  it("closes watchers on lifecycle dispose", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-dispose-");

    ensureLineageEventConsumer(projectPath);
    await vi.waitFor(() => {
      expect(mocks.watcherCloseFns).toHaveLength(1);
    });

    mocks.disposable?.dispose();

    expect(mocks.watcherCloseFns[0]).toHaveBeenCalledTimes(1);
  });
});
