import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FSWatcher, WatchEventType } from "fs";
import type {
  ProposalStatus,
  ProposalStatusChangedPayload,
  ProposalWorktreeMode,
} from "@shared/types/proposal";
import type { ProposalWatchContext } from "@main/services/proposal/browser/proposal-status-service";

const mocks = vi.hoisted(() => ({
  watchCallbacks: new Map<string, (eventType: WatchEventType, filename: string | null) => void>(),
  watcherErrors: new Map<string, (error: unknown) => void>(),
  watcherRecords: [] as Array<{ path: string; close: ReturnType<typeof vi.fn> }>,
  resolvedDirs: new Map<string, string | null>(),
  fileContents: new Map<string, string>(),
  missingDirectories: new Set<string>(),
  resolveChangeDirInTarget: vi.fn(async (targetPath: string) => {
    return mocks.resolvedDirs.get(targetPath) ?? null;
  }),
  readIfExists: vi.fn(async (path: string) => mocks.fileContents.get(path) ?? null),
  existsSync: vi.fn((path: string) => !mocks.missingDirectories.has(path)),
  watch: vi.fn(
    (path: string, listener: (eventType: WatchEventType, filename: string | null) => void) => {
      mocks.watchCallbacks.set(path, listener);
      const close = vi.fn();
      mocks.watcherRecords.push({ path, close });
      return {
        close,
        on: vi.fn((event: string, callback: (error: unknown) => void) => {
          if (event === "error") mocks.watcherErrors.set(path, callback);
          return undefined;
        }),
      } as unknown as FSWatcher;
    }
  ),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fs")>()),
  existsSync: mocks.existsSync,
  watch: mocks.watch,
}));

vi.mock("@main/infra/proposal/openspec-reader", () => ({
  resolveChangeDirInTarget: mocks.resolveChangeDirInTarget,
  readIfExists: mocks.readIfExists,
  parseYamlStatus: (content: string): ProposalStatus =>
    (content.match(/status:\s*(creating|draft|applying|archived)/)?.[1] as ProposalStatus) ??
    "draft",
}));

vi.mock("@main/infra/logger", () => ({ default: mocks.logger }));

import { proposalStatusService } from "@main/services/proposal/browser/proposal-status-service";

const refA = { folderId: "folder-a", changeId: "same-change" };
const refB = { folderId: "folder-b", changeId: "same-change" };
const listeners: Array<() => void> = [];

function watchContext(
  ownerMainPath: string,
  targetPath = ownerMainPath,
  worktreeMode: ProposalWorktreeMode = targetPath === ownerMainPath ? "main" : "linked"
): ProposalWatchContext {
  return { ownerMainPath, targetPath, worktreeMode };
}

function setProposalLocation(
  targetPath: string,
  dir: string | null,
  status = "status: applying\n"
) {
  mocks.resolvedDirs.set(targetPath, dir);
  if (dir) mocks.fileContents.set(`${dir}/.openspec.yaml`, status);
}

function collectEvents(): ProposalStatusChangedPayload[] {
  const events: ProposalStatusChangedPayload[] = [];
  listeners.push(proposalStatusService.onStatusChanged((payload) => events.push(payload)));
  return events;
}

describe("ProposalStatusService", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.watchCallbacks.clear();
    mocks.watcherErrors.clear();
    mocks.watcherRecords.length = 0;
    mocks.resolvedDirs.clear();
    mocks.fileContents.clear();
    mocks.missingDirectories.clear();
    proposalStatusService.unwatchAll();
  });

  afterEach(() => {
    proposalStatusService.unwatchAll();
    for (const stop of listeners.splice(0)) stop();
    vi.useRealTimers();
  });

  it("emits the complete ProposalRef with the initial status", async () => {
    const activeDir = "/repo-a/openspec/changes/same-change";
    setProposalLocation("/repo-a", activeDir, "status: creating\n");
    const events = collectEvents();

    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      workspaceId: "workspace-1",
      proposalRef: refA,
      sessionId: "session-1",
      status: "creating",
      changeKind: "status",
    });
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "[proposal-status] watcher started",
      expect.objectContaining({
        workspaceId: "workspace-1",
        folderId: "folder-a",
        changeId: "same-change",
        watcherKind: "content",
        path: activeDir,
      })
    );
  });

  it("emits the current status when tasks.md changes", async () => {
    const activeDir = "/repo-a/openspec/changes/same-change";
    setProposalLocation("/repo-a", activeDir);
    const events = collectEvents();
    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-1");
    await vi.waitFor(() => expect(events).toHaveLength(1));

    mocks.watchCallbacks.get(activeDir)?.("change", "tasks.md");

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({
      proposalRef: refA,
      sessionId: "session-1",
      status: "applying",
      changeKind: "tasks",
    });
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "[proposal-status] watcher event",
      expect.objectContaining({
        watcherKind: "content",
        path: activeDir,
        eventType: "change",
        filename: "tasks.md",
      })
    );
  });

  it("reconciles status changes from metadata events with a null filename", async () => {
    const activeDir = "/repo-a/openspec/changes/same-change";
    setProposalLocation("/repo-a", activeDir, "status: draft\n");
    const events = collectEvents();
    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-1");
    await vi.waitFor(() => expect(events).toHaveLength(1));
    mocks.fileContents.set(`${activeDir}/.openspec.yaml`, "status: applying\n");

    mocks.watchCallbacks.get(activeDir)?.("rename", null);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ status: "applying", changeKind: "status" });
  });

  it("follows a linked proposal through archive, main merge, and worktree removal", async () => {
    const linkedRoot = "/repo-a/.worktrees/same-change";
    const linkedActive = `${linkedRoot}/openspec/changes/same-change`;
    const linkedArchive = `${linkedRoot}/openspec/changes/archive/2026-08-09-same-change`;
    const mainArchive = "/repo-a/openspec/changes/archive/2026-08-09-same-change";
    setProposalLocation(linkedRoot, linkedActive);
    setProposalLocation("/repo-a", null);
    const events = collectEvents();
    proposalStatusService.watchProposal(
      "workspace-1",
      refA,
      watchContext("/repo-a", linkedRoot),
      "session-1"
    );
    await vi.waitFor(() => expect(events).toHaveLength(1));

    setProposalLocation(linkedRoot, linkedArchive);
    mocks.watchCallbacks.get(`${linkedRoot}/openspec/changes`)?.("rename", "same-change");
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ status: "archived", changeKind: "status" });

    setProposalLocation("/repo-a", mainArchive, "status: archived\n");
    mocks.watchCallbacks.get("/repo-a/openspec/changes/archive")?.(
      "rename",
      "2026-08-09-same-change"
    );
    setProposalLocation(linkedRoot, null);
    mocks.watchCallbacks.get(`${linkedRoot}/openspec/changes`)?.("rename", null);

    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(events[2]).toMatchObject({ status: "archived", changeKind: "status" });
    expect(events.some((event) => event.removed)).toBe(false);
    expect(mocks.watcherRecords.every((record) => record.close.mock.calls.length === 1)).toBe(true);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "[proposal-status] proposal watch released",
      expect.objectContaining({
        folderId: "folder-a",
        changeId: "same-change",
        reason: "archived-main",
        activeProposalWatchCount: 0,
      })
    );
  });

  it("keeps an archived linked proposal when git finalization does not reach main", async () => {
    const linkedRoot = "/repo-a/.worktrees/same-change";
    const linkedActive = `${linkedRoot}/openspec/changes/same-change`;
    const linkedArchive = `${linkedRoot}/openspec/changes/archive/2026-08-09-same-change`;
    setProposalLocation(linkedRoot, linkedActive);
    setProposalLocation("/repo-a", null);
    const events = collectEvents();
    proposalStatusService.watchProposal(
      "workspace-1",
      refA,
      watchContext("/repo-a", linkedRoot),
      "session-1"
    );
    await vi.waitFor(() => expect(events).toHaveLength(1));

    setProposalLocation(linkedRoot, linkedArchive);
    mocks.watchCallbacks.get(`${linkedRoot}/openspec/changes`)?.("rename", "same-change");

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ status: "archived" });
    expect(events.some((event) => event.removed)).toBe(false);
    expect(mocks.watcherRecords.some((record) => record.close.mock.calls.length === 0)).toBe(true);
  });

  it("attaches the main archive watcher after the archive root appears", async () => {
    const linkedRoot = "/repo-a/.worktrees/same-change";
    setProposalLocation(linkedRoot, `${linkedRoot}/openspec/changes/same-change`);
    setProposalLocation("/repo-a", null);
    mocks.missingDirectories.add("/repo-a/openspec/changes/archive");
    proposalStatusService.watchProposal(
      "workspace-1",
      refA,
      watchContext("/repo-a", linkedRoot),
      "session-1"
    );
    await vi.waitFor(() => expect(mocks.watchCallbacks.has("/repo-a/openspec/changes")).toBe(true));
    expect(mocks.watchCallbacks.has("/repo-a/openspec/changes/archive")).toBe(false);

    mocks.missingDirectories.delete("/repo-a/openspec/changes/archive");
    mocks.watchCallbacks.get("/repo-a/openspec/changes")?.("rename", "archive");

    await vi.waitFor(() =>
      expect(mocks.watchCallbacks.has("/repo-a/openspec/changes/archive")).toBe(true)
    );
  });

  it("emits removed only after bounded reconciliation cannot find any target", async () => {
    vi.useFakeTimers();
    const activeDir = "/repo-a/openspec/changes/same-change";
    setProposalLocation("/repo-a", activeDir, "status: draft\n");
    const events = collectEvents();
    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-1");
    await vi.waitFor(() => expect(events).toHaveLength(1));
    setProposalLocation("/repo-a", null);

    mocks.watchCallbacks.get("/repo-a/openspec/changes")?.("rename", "same-change");
    await vi.advanceTimersByTimeAsync(3_700);

    expect(events.at(-1)).toMatchObject({
      proposalRef: refA,
      changeKind: "status",
      removed: true,
    });
  });

  it("reconciles watcher errors and closes every watcher and retry on unwatch", async () => {
    vi.useFakeTimers();
    const linkedRoot = "/repo-a/.worktrees/same-change";
    setProposalLocation(linkedRoot, `${linkedRoot}/openspec/changes/same-change`);
    setProposalLocation("/repo-a", null);
    proposalStatusService.watchProposal(
      "workspace-1",
      refA,
      watchContext("/repo-a", linkedRoot),
      "session-1"
    );
    await vi.waitFor(() => expect(mocks.watcherRecords.length).toBeGreaterThanOrEqual(4));
    setProposalLocation(linkedRoot, null);
    mocks.watcherErrors.get(`${linkedRoot}/openspec/changes`)?.(new Error("removed"));
    await vi.advanceTimersByTimeAsync(50);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    proposalStatusService.unwatchProposal("workspace-1", refA);

    expect(mocks.watcherRecords.every((record) => record.close.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates same-name proposals from different Folders and shares session subscribers", async () => {
    setProposalLocation("/repo-a", "/repo-a/openspec/changes/same-change", "status: draft\n");
    setProposalLocation("/repo-b", "/repo-b/openspec/changes/same-change", "status: draft\n");
    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-a");
    proposalStatusService.watchProposal("workspace-1", refB, watchContext("/repo-b"), "session-b");
    await vi.waitFor(() => expect(mocks.watchCallbacks.has("/repo-b/openspec/changes")).toBe(true));
    proposalStatusService.watchProposal("workspace-1", refA, watchContext("/repo-a"), "session-c");

    proposalStatusService.unwatchSession("workspace-1", "session-a");
    expect(
      mocks.watcherRecords
        .filter((record) => record.path.startsWith("/repo-a/"))
        .some((record) => record.close.mock.calls.length > 0)
    ).toBe(false);
    proposalStatusService.unwatchSession("workspace-1", "session-c");
    expect(
      mocks.watcherRecords
        .filter((record) => record.path.startsWith("/repo-a/"))
        .every((record) => record.close.mock.calls.length === 1)
    ).toBe(true);
    expect(
      mocks.watcherRecords
        .filter((record) => record.path.startsWith("/repo-b/"))
        .every((record) => record.close.mock.calls.length === 0)
    ).toBe(true);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      "[proposal-status] proposal watch released",
      expect.objectContaining({ reason: "session-removed", sessionIds: [] })
    );
  });
});
