import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FSWatcher } from "fs";
import type { ProposalStatus, ProposalStatusChangedPayload } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  watchCallbacks: new Map<string, () => void>(),
  watcherCloses: [] as ReturnType<typeof vi.fn>[],
  resolveChangeDirInTarget: vi.fn(),
  readIfExists: vi.fn(),
  watch: vi.fn((path: string, listener: () => void) => {
    mocks.watchCallbacks.set(String(path), listener);
    const close = vi.fn();
    mocks.watcherCloses.push(close);
    return { close, on: vi.fn().mockReturnThis() } as unknown as FSWatcher;
  }),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fs")>()),
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

describe("ProposalStatusService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchCallbacks.clear();
    mocks.watcherCloses.length = 0;
    proposalStatusService.unwatchAll();
  });

  afterEach(() => proposalStatusService.unwatchAll());

  it("emits the complete ProposalRef with the initial status", async () => {
    mocks.resolveChangeDirInTarget.mockResolvedValue("/repo-a/openspec/changes/same-change");
    mocks.readIfExists.mockResolvedValue("status: creating\n");
    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));

    proposalStatusService.watchProposal("workspace-1", refA, "/repo-a", "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      workspaceId: "workspace-1",
      proposalRef: refA,
      sessionId: "session-1",
      status: "creating",
    });
  });

  it("isolates same-name proposals from different Folders", async () => {
    mocks.resolveChangeDirInTarget.mockImplementation(
      async (worktreePath: string) => `${worktreePath}/openspec/changes/same-change`
    );
    mocks.readIfExists.mockResolvedValue("status: draft\n");

    proposalStatusService.watchProposal("workspace-1", refA, "/repo-a", "session-a");
    proposalStatusService.watchProposal("workspace-1", refB, "/repo-b", "session-b");

    await vi.waitFor(() => expect(mocks.watcherCloses).toHaveLength(2));
    proposalStatusService.unwatchProposal("workspace-1", refA);
    expect(mocks.watcherCloses[0]).toHaveBeenCalledTimes(1);
    expect(mocks.watcherCloses[1]).not.toHaveBeenCalled();
  });

  it("shares one owner-qualified watcher across session subscribers", async () => {
    mocks.resolveChangeDirInTarget.mockResolvedValue("/repo-a/openspec/changes/same-change");
    mocks.readIfExists.mockResolvedValue("status: draft\n");
    proposalStatusService.watchProposal("workspace-1", refA, "/repo-a", "session-a");
    await vi.waitFor(() => expect(mocks.watcherCloses).toHaveLength(1));
    proposalStatusService.watchProposal("workspace-1", refA, "/repo-a", "session-b");

    proposalStatusService.unwatchProposal("workspace-1", refA, "session-a");
    expect(mocks.watcherCloses[0]).not.toHaveBeenCalled();
    proposalStatusService.unwatchProposal("workspace-1", refA, "session-b");
    expect(mocks.watcherCloses[0]).toHaveBeenCalledTimes(1);
  });

  it("emits removed only for the watched owner when its target disappears", async () => {
    const watchedPath = "/repo-a/openspec/changes/same-change/.openspec.yaml";
    mocks.resolveChangeDirInTarget
      .mockResolvedValueOnce("/repo-a/openspec/changes/same-change")
      .mockResolvedValueOnce(null);
    mocks.readIfExists.mockResolvedValueOnce("status: draft\n").mockResolvedValueOnce(null);
    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));
    proposalStatusService.watchProposal("workspace-1", refA, "/repo-a", "session-a");
    await vi.waitFor(() => expect(events).toHaveLength(1));

    mocks.watchCallbacks.get(watchedPath)?.();

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ proposalRef: refA, removed: true });
  });

  it("isolates the same ProposalRef across Workspaces", async () => {
    mocks.resolveChangeDirInTarget.mockResolvedValue("/shared/openspec/changes/same-change");
    mocks.readIfExists.mockResolvedValue("status: draft\n");
    proposalStatusService.watchProposal("workspace-a", refA, "/shared", "session-a");
    proposalStatusService.watchProposal("workspace-b", refA, "/shared", "session-b");
    await vi.waitFor(() => expect(mocks.watcherCloses).toHaveLength(2));

    proposalStatusService.unwatchWorkspace("workspace-a");
    expect(mocks.watcherCloses[0]).toHaveBeenCalledTimes(1);
    expect(mocks.watcherCloses[1]).not.toHaveBeenCalled();
  });
});
