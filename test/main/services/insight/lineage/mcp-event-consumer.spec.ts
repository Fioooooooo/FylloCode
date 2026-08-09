import { existsSync } from "fs";
import { promises as fs } from "fs";
import type { FSWatcher } from "fs";
import { join } from "path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { McpEvent, McpPlanEvent, McpProposalEvent } from "@shared/types/mcp-event";
import { createTestTempRoot } from "@test/main/test-temp-root";

const mocks = vi.hoisted(() => ({
  recordProposal: vi.fn(),
  recordRepositoryProposalRelation: vi.fn(),
  recordPlan: vi.fn(),
  ensureChatSubject: vi.fn(),
  watchProposal: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  resolveRepositoryTarget: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  watch: vi.fn(),
  watchCallbacks: [] as WatchCallback[],
  watcherCloseFns: [] as Array<{ path: string; close: ReturnType<typeof vi.fn> }>,
}));

function mcpEventsDir(workspaceId: string): string {
  return join(workspaceId, "mcp-events");
}

vi.mock("@main/infra/storage/workspace-paths", () => ({
  mcpEventsDir: (workspaceId: string) => `${workspaceId}/mcp-events`,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    watch: mocks.watch,
  };
});

vi.mock("@main/services/insight/lineage/lineage-service", () => ({
  recordProposal: mocks.recordProposal,
  recordPlan: mocks.recordPlan,
  ensureChatSubject: mocks.ensureChatSubject,
  recordRepositoryProposalRelation: mocks.recordRepositoryProposalRelation,
}));

vi.mock("@main/services/proposal/browser/proposal-status-service", () => ({
  proposalStatusService: {
    watchProposal: mocks.watchProposal,
  },
}));

vi.mock("@main/services/workspace/_public", () => ({
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
  resolveRepositoryTarget: mocks.resolveRepositoryTarget,
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

import {
  disposeLineageEventConsumers,
  disposeWorkspace,
  ensureLineageEventConsumer,
  resetLineageEventConsumersForTests,
} from "@main/services/insight/lineage/mcp-event-consumer";

type WatchCallback = () => void;

function proposalEvent(overrides: Partial<McpProposalEvent> = {}): McpProposalEvent {
  return {
    server: "fyllo-specs",
    tool: "create-proposal",
    createdAt: "2026-06-10T00:00:00.000Z",
    sessionId: "session-1",
    workspaceId: "",
    proposalRef: { folderId: "folder-1", changeId: "change-1" },
    worktreeMode: "main",
    worktreePath: "",
    ...overrides,
  };
}

function planEvent(overrides: Partial<McpPlanEvent> = {}): McpPlanEvent {
  return {
    server: "fyllo-specs",
    tool: "create-plan",
    createdAt: "2026-06-10T00:00:00.000Z",
    sessionId: "session-1",
    workspaceId: "",
    planSlug: "2026-06-29-plan-a",
    ...overrides,
  };
}

async function writeEventFile(
  projectPath: string,
  fileName: string,
  event: McpEvent | string
): Promise<string> {
  const eventDir = mcpEventsDir(projectPath);
  await fs.mkdir(eventDir, { recursive: true });
  const filePath = join(eventDir, fileName);
  const normalizedEvent =
    typeof event === "string"
      ? event
      : {
          ...event,
          workspaceId: event.workspaceId || projectPath,
          ...(event.tool === "create-proposal" && !event.worktreePath
            ? { worktreePath: projectPath }
            : {}),
        };
  await fs.writeFile(
    filePath,
    typeof normalizedEvent === "string" ? normalizedEvent : JSON.stringify(normalizedEvent),
    "utf8"
  );
  return filePath;
}

describe("lineage mcp event consumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchCallbacks = [];
    mocks.watcherCloseFns = [];
    mocks.recordProposal.mockResolvedValue({ id: "subject-1" });
    mocks.recordRepositoryProposalRelation.mockResolvedValue({ status: "recorded" });
    mocks.recordPlan.mockResolvedValue({ id: "subject-1" });
    mocks.ensureChatSubject.mockResolvedValue({ id: "chat-subject" });
    mocks.getRequiredWorkspaceInfo.mockImplementation(async (workspaceId: string) => ({
      folders: [
        {
          folderId: "folder-1",
          folderName: "Primary",
          folderPath: workspaceId,
          pathMissing: false,
          isPrimary: true,
        },
      ],
    }));
    mocks.resolveRepositoryTarget.mockImplementation(async (input) => ({
      ...input,
      worktreePath: input.worktreePath,
    }));
    mocks.watch.mockImplementation(((_path, listener) => {
      const close = vi.fn();
      mocks.watcherCloseFns.push({ path: String(_path), close });
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
    resetLineageEventConsumersForTests();
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
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", {
      folderId: "folder-1",
      changeId: "change-1",
    });
    expect(mocks.recordRepositoryProposalRelation).toHaveBeenCalledWith(
      { folderId: "folder-1", changeId: "change-1" },
      {
        workspaceId: projectPath,
        subjectId: "subject-1",
        relation: "origin",
        linkedAt: "2026-06-10T00:00:00.000Z",
      }
    );
    expect(mocks.ensureChatSubject).not.toHaveBeenCalled();
    expect(mocks.watchProposal).toHaveBeenCalledWith(
      projectPath,
      { folderId: "folder-1", changeId: "change-1" },
      {
        ownerMainPath: projectPath,
        targetPath: projectPath,
        worktreeMode: "main",
      },
      "session-1"
    );
  });

  it("consumes residual plan events on startup without chat fallback", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-plan-");
    const filePath = await writeEventFile(projectPath, "event.json", planEvent());

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.recordPlan).toHaveBeenCalledWith(projectPath, "session-1", "2026-06-29-plan-a");
    expect(mocks.ensureChatSubject).not.toHaveBeenCalled();
    expect(mocks.watchProposal).not.toHaveBeenCalled();
    expect(mocks.getRequiredWorkspaceInfo).not.toHaveBeenCalled();
    expect(mocks.resolveRepositoryTarget).not.toHaveBeenCalled();
  });

  it("ignores legacy Folder ownership on a plan event", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-plan-legacy-owner-");
    const legacyEvent = {
      ...planEvent(),
      folderId: "legacy-folder",
    } as McpEvent;
    const filePath = await writeEventFile(projectPath, "event.json", legacyEvent);

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.recordPlan).toHaveBeenCalledWith(projectPath, "session-1", "2026-06-29-plan-a");
    expect(mocks.getRequiredWorkspaceInfo).not.toHaveBeenCalled();
    expect(mocks.resolveRepositoryTarget).not.toHaveBeenCalled();
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

  it("creates a chat subject and retries when recordPlan returns null", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-plan-chat-");
    const filePath = await writeEventFile(projectPath, "event.json", planEvent());
    mocks.recordPlan.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "chat-subject" });

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.ensureChatSubject).toHaveBeenCalledWith(projectPath, "session-1");
    expect(mocks.recordPlan).toHaveBeenCalledTimes(2);
    expect(mocks.recordPlan).toHaveBeenNthCalledWith(
      1,
      projectPath,
      "session-1",
      "2026-06-29-plan-a"
    );
    expect(mocks.recordPlan).toHaveBeenNthCalledWith(
      2,
      projectPath,
      "session-1",
      "2026-06-29-plan-a"
    );
    expect(mocks.getRequiredWorkspaceInfo).not.toHaveBeenCalled();
  });

  it("skips damaged files while consuming valid files in the same scan", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-damaged-");
    const damagedPath = await writeEventFile(projectPath, "bad.json", "{not-json");
    const validPath = await writeEventFile(
      projectPath,
      "good.json",
      proposalEvent({ proposalRef: { folderId: "folder-1", changeId: "change-good" } })
    );

    ensureLineageEventConsumer(projectPath);

    await vi.waitFor(() => {
      expect(existsSync(validPath)).toBe(false);
    });
    expect(existsSync(damagedPath)).toBe(true);
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", {
      folderId: "folder-1",
      changeId: "change-good",
    });
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
      proposalEvent({ proposalRef: { folderId: "folder-1", changeId: "change-late" } })
    );
    mocks.watchCallbacks[0]!();

    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(false);
    });
    expect(mocks.recordProposal).toHaveBeenCalledWith(projectPath, "session-1", {
      folderId: "folder-1",
      changeId: "change-late",
    });
  });

  it("rejects an event whose workspaceId does not match the scanned Workspace", async () => {
    const workspaceId = createTestTempRoot("fyllo-lineage-workspace-mismatch-");
    const filePath = await writeEventFile(
      workspaceId,
      "event.json",
      proposalEvent({ workspaceId: "workspace-other" })
    );

    ensureLineageEventConsumer(workspaceId);

    await vi.waitFor(() => expect(mocks.logger.warn).toHaveBeenCalled());
    expect(existsSync(filePath)).toBe(true);
    expect(mocks.recordProposal).not.toHaveBeenCalled();
  });

  it("rejects a folderId outside the Workspace membership", async () => {
    const workspaceId = createTestTempRoot("fyllo-lineage-folder-mismatch-");
    const filePath = await writeEventFile(
      workspaceId,
      "event.json",
      proposalEvent({ proposalRef: { folderId: "folder-outside", changeId: "change-1" } })
    );

    ensureLineageEventConsumer(workspaceId);

    await vi.waitFor(() => expect(mocks.logger.warn).toHaveBeenCalled());
    expect(existsSync(filePath)).toBe(true);
    expect(mocks.recordProposal).not.toHaveBeenCalled();
  });

  it("rejects a proposal event whose worktree is not registered for the owner", async () => {
    const workspaceId = createTestTempRoot("fyllo-lineage-worktree-mismatch-");
    const filePath = await writeEventFile(
      workspaceId,
      "event.json",
      proposalEvent({ worktreeMode: "linked", worktreePath: "/unregistered/worktree" })
    );
    mocks.resolveRepositoryTarget.mockRejectedValueOnce(new Error("not registered"));

    ensureLineageEventConsumer(workspaceId);

    await vi.waitFor(() => expect(mocks.logger.error).toHaveBeenCalled());
    expect(existsSync(filePath)).toBe(true);
    expect(mocks.recordProposal).not.toHaveBeenCalled();
  });

  it("rejects a proposal event whose worktree mode does not match the resolved target", async () => {
    const workspaceId = createTestTempRoot("fyllo-lineage-worktree-mode-mismatch-");
    const filePath = await writeEventFile(
      workspaceId,
      "event.json",
      proposalEvent({ worktreeMode: "main", worktreePath: "/registered/linked-worktree" })
    );
    mocks.resolveRepositoryTarget.mockResolvedValueOnce({
      workspaceId,
      folderId: "folder-1",
      worktreePath: "/registered/linked-worktree",
    });

    ensureLineageEventConsumer(workspaceId);

    await vi.waitFor(() => expect(mocks.logger.warn).toHaveBeenCalled());
    expect(existsSync(filePath)).toBe(true);
    expect(mocks.recordProposal).not.toHaveBeenCalled();
  });

  it("closes watchers on lifecycle dispose", async () => {
    const projectPath = createTestTempRoot("fyllo-lineage-dispose-");

    ensureLineageEventConsumer(projectPath);
    await vi.waitFor(() => {
      expect(mocks.watcherCloseFns).toHaveLength(1);
    });

    disposeLineageEventConsumers();

    expect(mocks.watcherCloseFns[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("closes only the requested project watcher on project dispose", async () => {
    const projectA = createTestTempRoot("fyllo-lineage-project-a-");
    const projectB = createTestTempRoot("fyllo-lineage-project-b-");

    ensureLineageEventConsumer(projectA);
    ensureLineageEventConsumer(projectB);
    await vi.waitFor(() => {
      expect(mocks.watcherCloseFns).toHaveLength(2);
    });

    disposeWorkspace(projectA);

    const projectAClose = mocks.watcherCloseFns.find(
      (watcher) => watcher.path === mcpEventsDir(projectA)
    )?.close;
    const projectBClose = mocks.watcherCloseFns.find(
      (watcher) => watcher.path === mcpEventsDir(projectB)
    )?.close;

    expect(projectAClose).toHaveBeenCalledTimes(1);
    expect(projectBClose).not.toHaveBeenCalled();
  });
});
